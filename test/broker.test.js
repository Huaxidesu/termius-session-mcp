import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createBroker } from '../src/broker.js';

test('IPC rejects missing/wrong authentication and non-tool operations before reaching Termius', async () => {
  const calls = [], token = randomBytes(32).toString('hex');
  const broker = createBroker(token, async (method, args) => { calls.push({ method, args }); return { ok: true, value: { enabled: false } }; });
  const address = process.platform === 'win32' ? '\\\\.\\pipe\\tsm-test-' + randomBytes(12).toString('hex') : '/tmp/tsm-test-' + randomBytes(12).toString('hex');
  broker.server.listen(address); await once(broker.server,'listening');
  const send = message => new Promise((resolve, reject) => {
    const socket = net.createConnection(address); let output='';
    socket.on('connect',()=>socket.end(JSON.stringify(message)+'\n'));
    socket.on('data',b=>output+=b);socket.on('error',reject);socket.on('close',()=>resolve(output));
  });
  try {
    await send({method:'status',args:{}}); await send({token:'0'.repeat(64),method:'status',args:{}}); assert.equal(calls.length,0);
    assert.equal(JSON.parse(await send({token,method:'enable',args:{}})).ok,false);assert.equal(calls.length,0);
    assert.equal(JSON.parse(await send({token,method:'status',args:{}})).ok,true);assert.equal(calls.length,1);
  } finally { broker.close(); }
});
