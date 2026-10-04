import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PipeCdp } from './pipe-cdp.js';
import { createBroker } from './broker.js';
import { createPolicy } from './policy.js';
import { installRenderer } from './renderer.js';
import { createPrivateDirectory } from './private-state.js';
const diagnosticPath = fileURLToPath(new URL('../launcher.log', import.meta.url));
function diagnostic(message) { try { fs.appendFileSync(diagnosticPath, new Date().toISOString() + ' ' + message + '\n'); } catch {} }

export function primaryTarget(target, exe) {
  try {
    const url = new URL(target.url);
    const expected = path.join(path.dirname(exe), 'resources/app.asar/ui-process/src/ui-process/main.html');
    return target.type === 'page' && url.protocol === 'file:' && url.searchParams.get('type') === 'primary' && path.normalize(fileURLToPath(url)).toLowerCase() === path.normalize(expected).toLowerCase();
  } catch { return false; }
}
function parseArgs() {
  const result = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const name = process.argv[i];
    if (!['--termius', '--state-dir', '--test-profile'].includes(name) || !process.argv[i + 1] || result[name]) throw new Error('Usage: node src/launcher.js --termius ABSOLUTE_EXE --state-dir PRIVATE_DIRECTORY [--test-profile EMPTY_DIRECTORY]');
    result[name] = process.argv[i + 1];
  }
  if (!path.isAbsolute(result['--termius'] || '') || !path.isAbsolute(result['--state-dir'] || '')) throw new Error('Executable and state directory must be absolute');
  return result;
}
async function main() {
  diagnostic('Launcher entered');
  const opts = parseArgs(), exe = fs.realpathSync(opts['--termius']);
  if (process.platform !== 'win32') throw new Error('This release is Windows-only; no untested fallback transport is enabled');
  createPrivateDirectory(opts['--state-dir']);
  diagnostic('Private directory verified');
  const stateDir = fs.realpathSync(opts['--state-dir']);
  // Require a pre-created private directory; setup.ps1 applies the Windows ACL.
  const descriptor = path.join(stateDir, 'endpoint.json');
  if (fs.existsSync(descriptor)) throw new Error('An endpoint already exists. Close the previous MCP launcher before starting another; use setup to recover stale state.');
  const token = randomBytes(32).toString('hex'), suffix = randomBytes(24).toString('hex');
  const pipe = '\\\\.\\pipe\\termius-session-mcp-' + suffix;
  const key = '__tsm_' + randomBytes(24).toString('hex');
  const args = ['--remote-debugging-pipe'];
  if (opts['--test-profile']) {
    const profile = opts['--test-profile'];
    if (!path.isAbsolute(profile) || !fs.existsSync(profile) || fs.readdirSync(profile).length) throw new Error('Test profile must be an existing empty absolute directory');
    args.push('--user-data-dir=' + profile);
  }
  const child = spawn(exe, args, { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], windowsHide: false, shell: false });
  diagnostic('Termius process requested');
  child.on('error', () => { console.error('Termius could not be started'); process.exitCode = 1; });
  const cdp = new PipeCdp(child.stdio[3], child.stdio[4]);
  let session = null, stopped = false, polling = false, timer;
  const expression = `(${installRenderer.toString()})(${createPolicy.toString()},${JSON.stringify(key)})`;
  async function evaluate(code, timeout = 5000) {
    if (!session) throw new Error('Termius primary window is not ready');
    const r = await cdp.call('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true }, session, timeout);
    if (r.exceptionDetails || !r.result || r.result.type === 'undefined') throw new Error('Termius integration unavailable');
    return r.result.value;
  }
  async function invoke(method, args = {}) {
    // Method is a closed enum. JSON serialization prevents argument-to-code injection.
    return evaluate(`(async()=>{try{return {ok:true,value:await globalThis[${JSON.stringify(key)}](${JSON.stringify(method)},${JSON.stringify(args)})}}catch(e){return {ok:false,error:String(e.message).slice(0,200)}}})()`, 35000);
  }
  async function poll() {
    if (polling || stopped) return; polling = true;
    try {
      const { targetInfos } = await cdp.call('Target.getTargets');
      const candidates = targetInfos.filter(t => primaryTarget(t, exe));
      if (candidates.length !== 1) { if (session) await invoke('disable').catch(() => {}); session = null; return; }
      if (!session) {
        const attached = await cdp.call('Target.attachToTarget', { targetId: candidates[0].targetId, flatten: true });
        session = attached.sessionId;
      }
      await evaluate(expression);
      if (!poll.hasReportedReady) { diagnostic('Panel injection verified'); poll.hasReportedReady = true; }
    } catch (e) { if (!poll.hasReportedError) { diagnostic('Panel unavailable: ' + e.message); poll.hasReportedError = true; } session = null; }
    finally { polling = false; }
  }
  const broker = createBroker(token, invoke), server = broker.server;
  function cleanup() {
    if (stopped) return; stopped = true; clearInterval(timer);
    broker.close();
    try { const current = JSON.parse(fs.readFileSync(descriptor, 'utf8')); if (current.token === token) fs.unlinkSync(descriptor); } catch {}
  }
  child.on('exit', code => {
    diagnostic('Termius exited: ' + code);
    if (code) { console.error('Termius exited with code ' + code + '. No security fallback was attempted.'); process.exitCode = 1; }
    cleanup();
  }); cdp.on('closed', cleanup);
  // The private CDP pipe belongs to this process. Exiting it may close Termius.
  process.on('SIGINT', () => { invoke('disable').finally(() => { cleanup(); process.exit(0); }); });
  process.on('SIGTERM', () => { invoke('disable').finally(() => { cleanup(); process.exit(0); }); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(pipe, resolve); });
  if (stopped) { server.close(); return; }
  fs.writeFileSync(descriptor, JSON.stringify({ version: 1, pipe, token, pid: process.pid }), { flag: 'wx', mode: 0o600 });
  if (stopped) return;
  await poll(); if (stopped) return; timer = setInterval(poll, 2000);
  console.error('Termius Session MCP launcher active. Enable sharing in the Termius panel.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { diagnostic('Launch failed: ' + error.message); console.error('Launch failed:', error.message); process.exitCode = 1; });
