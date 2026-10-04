import { EventEmitter } from 'node:events';
export class PipeCdp extends EventEmitter {
  constructor(input, output) {
    super(); this.input = input; this.pending = new Map(); this.id = 0; this.buffer = Buffer.alloc(0); this.closed = false;
    output.on('data', data => {
      this.buffer = Buffer.concat([this.buffer, data]);
      if (this.buffer.length > 2 * 1024 * 1024) return this.fail();
      let i;
      while ((i = this.buffer.indexOf(0)) !== -1) {
        const frame = this.buffer.subarray(0, i); this.buffer = this.buffer.subarray(i + 1);
        try {
          const m = JSON.parse(frame.toString('utf8'));
          const p = this.pending.get(m.id);
          if (p) { this.pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error('Termius debugger request failed')) : p.resolve(m.result); }
          else if (m.method) this.emit('event', m);
        } catch { this.fail(); }
      }
    });
    output.on('error', () => this.fail()); output.on('end', () => this.fail());
    input.on('error', () => this.fail());
  }
  fail() {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Private Termius pipe closed')); }
    this.pending.clear(); this.emit('closed');
  }
  call(method, params = {}, sessionId, timeout = 5000) {
    if (this.closed) return Promise.reject(new Error('Private Termius pipe closed'));
    if (this.pending.size >= 16) return Promise.reject(new Error('Too many debugger requests'));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Termius request timed out')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.input.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
  }
}
