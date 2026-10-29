import test from 'node:test';
import assert from 'node:assert/strict';
import { createPolicy } from '../src/policy.js';

function fixture() {
  let time = 1, sequence = 0, good = true, callback, disposed = 0;
  const writes = [], approvals = [], target = {};
  const p = createPolicy({ now: () => time, randomId: () => 'id-' + ++sequence, changed() {}, approve: r => approvals.push(r), valid: () => good,
    subscribe(t, cb) { callback = cb; return () => disposed++; }, send(t, text) { writes.push({ t, text }); } });
  return { p, target, writes, approvals, advance(n) { time += n; }, invalidate() { good = false; }, emit(s) { callback?.(s); }, get disposed() { return disposed; }, grant() { p.enable(true); return p.share(target, true); } };
}
test('off by default; remote/synthetic enable and share refused', () => {
  const f = fixture(); assert.deepEqual(f.p.status(), { enabled: false, shared: false, pending: false, autoApprove: false });
  assert.throws(() => f.p.enable(false)); assert.throws(() => f.p.share(f.target, false));
  assert.throws(() => f.p.request('write', { session: 'anything', text: 'echo' }));
});
test('write executes once only after trusted approval and exact target validation', async () => {
  const f = fixture(), id = f.grant(), r = f.p.request('write', { session: id, text: 'echo test\n' });
  assert.equal(f.writes.length, 0);
  const a = f.approvals[0]; assert.equal(f.p.decide(a.id, true, false), false); assert.equal(f.writes.length, 0);
  f.p.decide(a.id, true, true); await r; f.p.decide(a.id, true, true);
  assert.deepEqual(f.writes, [{ t: f.target, text: 'echo test\n' }]);
});
test('disable cancels queued commands, disposes output and clears grants', async () => {
  const f = fixture(), id = f.grant(), r = f.p.request('write', { session: id, text: 'echo test' });
  f.p.disable(); await assert.rejects(r, /撤销/); assert.equal(f.disposed, 1);
  f.p.decide(f.approvals[0].id, true, true); assert.equal(f.writes.length, 0); assert.deepEqual(f.p.sessions(), []);
});
test('session replacement and expiry cannot execute an approved command', async () => {
  for (const mutation of [f => f.invalidate(), f => f.advance(30001)]) {
    const f = fixture(), id = f.grant(), r = f.p.request('write', { session: id, text: 'echo test' });
    mutation(f); f.p.decide(f.approvals[0].id, true, true); await assert.rejects(r); assert.equal(f.writes.length, 0);
  }
});
test('reads do not release anything before approval; user can redact output', async () => {
  const f = fixture(), id = f.grant(); f.emit('token=FAKE');
  const r = f.p.request('read', { session: id }); assert.equal(f.approvals[0].text, 'token=FAKE');
  f.p.decide(f.approvals[0].id, true, true, 'token=[REDACTED]'); assert.deepEqual(await r, { text: 'token=[REDACTED]' });
});
test('output arriving during approval is not silently included', async () => {
  const f = fixture(), id = f.grant(); f.emit('reviewed'); const r = f.p.request('read', { session: id }); f.emit('unreviewed');
  f.p.decide(f.approvals[0].id, true, true, 'reviewed'); assert.deepEqual(await r, { text: 'reviewed' });
});
test('denied reads are discarded; disabled capture is ignored', async () => {
  const f = fixture(), id = f.grant(); f.emit('secret'); const r = f.p.request('read', { session: id });
  f.p.decide(f.approvals[0].id, false, true); await assert.rejects(r, /拒绝/);
  const r2 = f.p.request('read', { session: id }); assert.equal(f.approvals[1].text, ''); f.p.disable(); await assert.rejects(r2);
  f.emit('after-off'); const newId = f.grant(); const r3 = f.p.request('read', { session: newId }); assert.equal(f.approvals[2].text, ''); f.p.disable(); await assert.rejects(r3);
});
test('control sequences and oversized input refused; only one pending request', async () => {
  const f = fixture(), id = f.grant();
  for (const text of ['\x1b[31m', '\r', '\x03', '\u202efoo', 'x'.repeat(4097)]) assert.throws(() => f.p.request('write', { session: id, text }));
  const r = f.p.request('write', { session: id, text: 'okay' }); assert.throws(() => f.p.request('read', { session: id }), /等待审批/); f.p.disable(); await assert.rejects(r);
});
test('output is bounded and session expires after 24 hours', async () => {
  const f = fixture(), id = f.grant(); f.emit('x'.repeat(100000)); const r = f.p.request('read', { session: id });
  assert.equal(f.approvals[0].text.length, 8192); assert.equal(f.approvals[0].truncated, true); f.p.disable(); await assert.rejects(r);
  f.grant(); f.advance(86_400_001); f.p.tick(); assert.deepEqual(f.p.sessions(), []);
});
test('auto-approve toggle switches between immediate execution and manual approval', async () => {
  const f = fixture(), id = f.grant();
  assert.equal(f.p.status().autoApprove, false);
  f.p.setAutoApprove(true); assert.equal(f.p.status().autoApprove, true);
  const r1 = f.p.request('write', { session: id, text: 'echo auto' });
  assert.deepEqual(await r1, { sent: true, auto: true });
  assert.equal(f.writes.length, 1); assert.equal(f.approvals.length, 0);
  f.p.setAutoApprove(false); assert.equal(f.p.status().autoApprove, false);
  const r2 = f.p.request('write', { session: id, text: 'echo manual' });
  assert.equal(f.writes.length, 1); assert.equal(f.approvals.length, 1);
  f.p.decide(f.approvals[0].id, true, true); await r2; assert.equal(f.writes.length, 2);
});
