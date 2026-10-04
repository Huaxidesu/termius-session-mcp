// This function is serialized into the Termius renderer. Keep it self-contained.
export function createPolicy({ now, randomId, changed, approve, valid, subscribe, send }) {
  let enabled = false, grant = null, pending = null, buffer = '', dropped = false;
  const fail = message => { throw new Error(message); };
  function cancel(reason = 'Request cancelled') {
    if (pending) { const p = pending; pending = null; p.reject(new Error(reason)); changed(); }
  }
  function revoke() {
    cancel('Session access revoked');
    if (grant) { try { grant.dispose(); } catch {} }
    grant = null; buffer = ''; dropped = false; changed();
  }
  function disable() { enabled = false; revoke(); }
  function check(id) {
    if (!enabled || !grant || grant.id !== id) fail('Session is not shared');
    if (now() >= grant.expires || !valid(grant.target)) { revoke(); fail('Session changed, hidden, disconnected, or expired'); }
    return grant;
  }
  function tick() {
    if (grant && (now() >= grant.expires || !valid(grant.target))) revoke();
    if (pending && now() >= pending.deadline) cancel('Approval expired');
  }
  function share(target, trusted) {
    if (!trusted || !enabled) fail('Enable MCP and share a session in Termius');
    if (!valid(target)) fail('Select one visible, connected terminal');
    revoke();
    const next = { id: randomId(), target, expires: now() + 10 * 60_000, dispose() {} };
    grant = next;
    try {
      next.dispose = subscribe(target, chunk => {
        if (grant !== next || !enabled) return;
        if (!valid(target) || now() >= next.expires) { revoke(); return; }
        if (typeof chunk !== 'string') return;
        buffer += chunk;
        if (buffer.length > 32768) { buffer = buffer.slice(-32768); dropped = true; }
      });
    } catch { revoke(); fail('Cannot subscribe to this terminal safely'); }
    changed(); return next.id;
  }
  function request(kind, args) {
    const g = check(args.session);
    if (pending) fail('Another request is awaiting approval');
    if (kind === 'write') {
      if (typeof args.text !== 'string' || !args.text.length || args.text.length > 4096 || /[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(args.text)) fail('Only visible text, tabs and LF newlines are accepted (max 4096 characters)');
    } else if (kind !== 'read') fail('Unknown operation');
    const text = kind === 'read' ? buffer.slice(0, 8192) : args.text;
    // Consume this snapshot now; denial discards it. Later output is a separate request.
    const truncated = dropped || (kind === 'read' && buffer.length > 8192);
    if (kind === 'read') { buffer = ''; dropped = false; }
    return new Promise((resolve, reject) => {
      const p = { id: randomId(), kind, text, target: g.target, session: g.id, deadline: now() + 30_000, resolve, reject };
      pending = p;
      approve({ id: p.id, kind, text, truncated, deadline: p.deadline, session: g.id });
      changed();
    });
  }
  function decide(id, allowed, trusted, approvedText) {
    if (!trusted || !pending || pending.id !== id) return false;
    const p = pending;
    if (!allowed) { cancel('Denied in Termius'); changed(); return true; }
    try {
      if (now() >= p.deadline) fail('Approval expired');
      const g = check(p.session);
      if (g.target !== p.target) fail('Session changed');
      pending = null;
      if (p.kind === 'write') {
        try { send(g.target, p.text); } catch { fail('Delivery failed; do not retry automatically because execution may have started'); }
        p.resolve({ sent: true });
      }
      else {
        if (typeof approvedText !== 'string' || approvedText.length > 8192) fail('Invalid reviewed output');
        p.resolve({ text: approvedText });
      }
    } catch (e) { pending = null; p.reject(e); }
    changed(); return true;
  }
  return {
    enable(trusted) { if (!trusted) fail('Use the switch in Termius'); enabled = true; changed(); },
    disable, revoke, share, tick, request, decide, cancel,
    status() { tick(); return { enabled, shared: !!grant, pending: !!pending }; },
    sessions() { tick(); return grant ? [{ id: grant.id, label: 'User-shared terminal', expiresAt: grant.expires }] : []; }
  };
}
