import net from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { readLines, validateOperation } from './wire.js';

export function createBroker(token, invoke) {
  let busy = false;
  const sockets = new Set();
  const server = net.createServer(socket => {
    if (sockets.size >= 8) return socket.destroy();
    sockets.add(socket); socket.setTimeout(5000, () => socket.destroy());
    let used = false, ownsRequest = false, finished = false;
    socket.on('error', () => {});
    socket.on('close', () => {
      sockets.delete(socket);
      if (ownsRequest && !finished) invoke('cancel').catch(() => {});
    });
    readLines(socket, async line => {
      if (used) return socket.destroy(); used = true;
      try {
        const msg = JSON.parse(line);
        if (!msg || typeof msg.token !== 'string' || !/^[a-f0-9]{64}$/.test(msg.token) || !timingSafeEqual(Buffer.from(msg.token), Buffer.from(token))) return socket.destroy();
        validateOperation(msg.method, msg.args);
        if (busy) throw new Error('Another request is pending');
        socket.setTimeout(40000, () => socket.destroy());
        busy = true; ownsRequest = true;
        const result = await invoke(msg.method, msg.args);
        finished = true;
        socket.end(JSON.stringify(result) + '\n');
      } catch { finished = true; socket.end(JSON.stringify({ ok: false, error: 'Request refused or Termius is unavailable' }) + '\n'); }
      finally { if (ownsRequest) busy = false; }
    }, () => socket.destroy());
  });
  return { server, close() { for (const s of sockets) s.destroy(); server.close(); } };
}
