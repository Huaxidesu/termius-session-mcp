import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { serve } from '../src/client.js';
import { validateOperation, readLines } from '../src/wire.js';
import { PipeCdp } from '../src/pipe-cdp.js';
const wait = () => new Promise(r => setImmediate(r));
test('MCP lifecycle, tool discovery, unknown tools and malformed input', async () => {
  const input = new PassThrough(), output = new PassThrough(), replies = [], calls = [];
  output.on('data', b => replies.push(JSON.parse(b.toString())));
  serve(input, output, async (...args) => { calls.push(args); return { enabled: false }; });
  const send = (id, method, params) => input.write(JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params }) + '\n');
  send(1,'tools/list'); await wait(); assert.equal(replies.pop().error.code,-32602);
  send(2,'initialize',{protocolVersion:'2025-06-18'}); await wait(); assert.equal(replies.pop().result.protocolVersion,'2025-06-18');
  send(undefined,'notifications/initialized'); send(3,'tools/list'); await wait(); assert.equal(replies.pop().result.tools.length,4);
  send(4,'tools/call',{name:'status'}); await wait(); assert.equal(calls.length,1); assert.equal(replies.pop().result.isError,undefined);
  send(5,'tools/call',{name:'eval',arguments:{expression:'evil'}}); await wait(); assert.equal(replies.pop().result.isError,true); assert.equal(calls.length,1);
  input.write('not json\n'); await wait(); assert.equal(replies.pop().error.code,-32700); input.end();
});
test('local transport rejects overflow and split UTF-8 remains intact', () => {
  const stream = new PassThrough(), lines = []; let failed=false;
  readLines(stream,l=>lines.push(l),()=>failed=true,32);
  const b=Buffer.from('hello €\n'); stream.write(b.subarray(0,7));stream.write(b.subarray(7));assert.equal(lines[0],'hello €');
  stream.write('x'.repeat(33));assert.equal(failed,true);
});
test('arguments cannot smuggle methods, scripts or extra fields', () => {
  for(const m of ['enable','share','eval','disable','constructor']) assert.throws(()=>validateOperation(m,{}));
  assert.throws(()=>validateOperation('status',{script:'evil'}));assert.throws(()=>validateOperation('read',{session:'fake'}));
});
test('CDP uses NUL framed messages with no string evaluation of arguments', async () => {
  const input=new PassThrough(),output=new PassThrough(),cdp=new PipeCdp(input,output);let frame;
  input.on('data', b=>frame=b.toString());const r=cdp.call('Target.getTargets');
  assert.equal(frame.at(-1),'\0');const request=JSON.parse(frame.slice(0,-1));
  output.write(JSON.stringify({id:request.id,result:{targetInfos:[]}})+'\0');assert.deepEqual(await r,{targetInfos:[]});
  const pending=cdp.call('Runtime.enable');output.end();await assert.rejects(pending,/closed/);
});
