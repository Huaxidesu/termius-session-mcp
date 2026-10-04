// Small bounded newline transport used for local IPC and MCP stdio.
export function readLines(stream, onLine, onFailure, limit = 65536) {
  let buffer = Buffer.alloc(0), failed = false;
  stream.on('data', chunk => {
    if (failed) return;
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    if (buffer.length > limit) { failed = true; onFailure(); return; }
    let i;
    while ((i = buffer.indexOf(10)) !== -1) {
      const line = buffer.subarray(0, i).toString('utf8'); buffer = buffer.subarray(i + 1);
      if (line.trim()) onLine(line);
    }
  });
}
export function validateOperation(method, args) {
  if (!['status', 'sessions', 'read', 'write'].includes(method)) throw new Error('Unknown tool');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid arguments');
  const allowed = method === 'write' ? ['session', 'text'] : method === 'read' ? ['session'] : [];
  if (Object.keys(args).some(k => !allowed.includes(k))) throw new Error('Unexpected argument');
  if (['read', 'write'].includes(method) && (typeof args.session !== 'string' || !/^[a-f0-9-]{36}$/i.test(args.session))) throw new Error('Invalid session');
  if (method === 'write' && (typeof args.text !== 'string' || !args.text.length || args.text.length > 4096 || /[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(args.text))) throw new Error('Invalid terminal text');
}
