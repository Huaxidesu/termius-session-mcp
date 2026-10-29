// Termius Session MCP 探针 / 命令行客户端
// 用法：
//   node probe.js                    只看状态和已共享会话
//   node probe.js --run "uname -a"   在共享终端里执行命令并读回输出
//
// 前置条件：Termius 必须由 launcher 启动（scripts\Termius with Session MCP.lnk），
// 且已在 Termius 面板里 Turn MCP on + Share visible terminal。

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const CLIENT = path.join(here, 'src', 'client.js');
const STATE = process.env.TERMIUS_MCP_STATE
  || path.join(process.env.LOCALAPPDATA || '', 'TermiusSessionMCP');

const argv = process.argv.slice(2);
const runIndex = argv.indexOf('--run');
const command = runIndex !== -1 ? argv[runIndex + 1] : null;

const child = spawn(NODE, [CLIENT, STATE], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
const pending = new Map();
let seq = 1;

const send = obj => child.stdin.write(JSON.stringify(obj) + '\n');

function rpc(method, params, timeout = 20000) {
  const id = seq++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    send({ jsonrpc: '2.0', id, method, params });
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error('timeout: ' + method)); }
    }, timeout);
  });
}

child.stdout.on('data', chunk => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch { /* 忽略非 JSON 行 */ }
  }
});

child.stderr.on('data', d => console.error('[client]', String(d).trim().slice(0, 300)));

const call = async (name, args = {}) => {
  const res = await rpc('tools/call', { name, arguments: args });
  const text = res.result?.content?.[0]?.text;
  if (res.result?.isError) throw new Error(name + ' -> ' + text);
  return JSON.parse(text);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'termius-probe', version: '1' }
  });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  const status = await call('status');
  console.log('status   :', JSON.stringify(status));

  if (!status.enabled) {
    console.log('\n>> MCP 处于关闭状态。请在 Termius 面板点 Turn MCP on。');
    process.exitCode = 2;
  } else {
    const sessions = await call('sessions');
    console.log('sessions :', JSON.stringify(sessions));

    if (!sessions.length) {
      console.log('\n>> 没有共享的终端。请在 Termius 里连上一个终端，然后点 Share visible terminal。');
      process.exitCode = 3;
    } else if (command) {
      const id = sessions[0].id;
      await call('read', { session: id });            // 清空旧缓冲
      const sent = await call('write', { session: id, text: command.replace(/\s+$/, '') + '\n' });
      console.log('write    :', JSON.stringify(sent));
      await sleep(2500);
      const out = await call('read', { session: id });
      console.log('\n--- output ---\n' + out.text.trimEnd());
      if (out.truncated) console.log('\n(输出被截断，单次上限 8192 字符)');
    }
  }
} catch (error) {
  console.error('\nERROR:', error.message);
  console.error('排查顺序：');
  console.error('  1. launcher 是否在运行（黑色命令行窗口）');
  console.error('  2. 若报 endpoint 已存在：确认 endpoint.json 里的 pid 已退出后删除该文件');
  console.error('  3. 状态目录:', STATE);
  process.exitCode = 1;
} finally {
  child.kill();
  setTimeout(() => process.exit(process.exitCode || 0), 200);
}
