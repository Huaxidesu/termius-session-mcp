import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { installRenderer } from '../src/renderer.js';
import { createPolicy } from '../src/policy.js';

function fixture() {
  const nodes = [], writes = [], outputHandlers = new Set(), timers = [];
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.listeners = {}; this.isConnected = true; this.disabled = false; this.checked = false; this.value = ''; nodes.push(this); }
    append(...children) { this.children.push(...children); }
    attachShadow() { this.shadow = new Element('shadow'); return this.shadow; }
    setAttribute(k, v) { this[k] = v; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    getBoundingClientRect() { return { width: 800, height: 400 }; }
    event(name, trusted = true) { if (!this.disabled) this.listeners[name]?.({ isTrusted: trusted }); }
  }
  const terminal = new Element('terminal');
  const connection = {}, shell = { sendData(text) { writes.push(text); } };
  const mediator = { id: 'private-real-terminal-id', _currentConnection: connection, shell,
    _onShellOutput: { event(cb) { outputHandlers.add(cb); return { dispose() { outputHandlers.delete(cb); } }; } },
    _onDisconnect: { event() { return { dispose() {} }; } }, _onExit: { event() { return { dispose() {} }; } } };
  terminal['__reactFiber$mock'] = { memoizedProps: { mediator } };
  const document = { body: new Element('body'), visibilityState: 'visible', createElement: t => new Element(t), createTextNode: t => ({ textContent: t }), querySelectorAll: () => [terminal], hasFocus: () => true, addEventListener() {} };
  const sandbox = { document, window: { addEventListener() {} }, crypto: { randomUUID }, getComputedStyle: () => ({ visibility: 'visible', display: 'block' }), setInterval(fn) { timers.push(fn); return 1; }, clearInterval() {}, queueMicrotask, console };
  vm.runInNewContext(`(${installRenderer.toString()})(${createPolicy.toString()},'bridge')`, sandbox);
  const button = text => nodes.find(e => e.tag === 'button' && e.textContent === text);
  return { sandbox, document, terminal, mediator, nodes, button, writes, outputHandlers, tick() { timers.forEach(fn => fn()); }, call: sandbox.bridge };
}
const flush = () => new Promise(r => setImmediate(r));
test('renderer starts off; synthetic click cannot enable; auto-approve sends immediately', async () => {
  const f = fixture(); assert.equal((await f.call('status')).enabled, false); assert.equal(f.outputHandlers.size, 0);
  f.button('开启 MCP').event('click', false); await flush(); assert.equal((await f.call('status')).enabled, false);
  await assert.rejects(f.call('enable'));
  f.button('开启 MCP').event('click'); await flush(); f.button('共享当前终端').event('click'); await flush();
  assert.equal(f.outputHandlers.size, 1); const [s] = await f.call('sessions'); assert.notEqual(s.id, 'private-real-terminal-id');
  const result = await f.call('write', { session: s.id, text: 'echo MOCK_ONLY\n' });
  assert.equal(result.sent, true); assert.equal(result.auto, true); assert.deepEqual(f.writes, ['echo MOCK_ONLY\n']);
  f.button('关闭 MCP').event('click'); await flush(); assert.equal(f.outputHandlers.size, 0); assert.equal((await f.call('sessions')).length, 0);
});
test('renderer returns buffered output to the client without an approval step', async () => {
  const f = fixture(); f.button('开启 MCP').event('click'); await flush(); f.button('共享当前终端').event('click'); await flush();
  for (const cb of f.outputHandlers) cb('FAKE_TOKEN=example');
  const [s] = await f.call('sessions');
  const out = await f.call('read', { session: s.id });
  assert.equal(out.text, 'FAKE_TOKEN=example'); assert.equal(out.truncated, false); assert.equal(out.auto, true);
});
test('renderer revokes when same terminal gets a new connection object', async () => {
  const f = fixture(); f.button('开启 MCP').event('click'); await flush(); f.button('共享当前终端').event('click'); await flush();
  f.mediator._currentConnection = {}; f.tick(); await flush(); assert.equal((await f.call('sessions')).length, 0); assert.equal(f.outputHandlers.size, 0);
});
