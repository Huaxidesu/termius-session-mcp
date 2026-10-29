// This function is serialized into the Termius renderer. Keep it self-contained.
// 该函数会被序列化后注入 Termius 渲染进程，必须保持自包含。
export function createPolicy({ now, randomId, changed, approve, valid, subscribe, send, autoApprove = false, grantMs = 24 * 60 * 60 * 1000 }) {
  let enabled = false, grant = null, pending = null, buffer = '', dropped = false, auto = !!autoApprove;
  const fail = message => { throw new Error(message); };
  function cancel(reason = '请求已取消') {
    if (pending) { const p = pending; pending = null; p.reject(new Error(reason)); changed(); }
  }
  function revoke() {
    cancel('会话授权已撤销');
    if (grant) { try { grant.dispose(); } catch {} }
    grant = null; buffer = ''; dropped = false; changed();
  }
  function disable() { enabled = false; revoke(); }
  function check(id) {
    if (!enabled || !grant || grant.id !== id) fail('该会话未被共享');
    if (now() >= grant.expires || !valid(grant.target)) { revoke(); fail('会话已切换、窗口不可见、已断开或授权已过期'); }
    return grant;
  }
  function tick() {
    if (grant && (now() >= grant.expires || !valid(grant.target))) revoke();
    if (pending && now() >= pending.deadline) cancel('审批超时');
  }
  function share(target, trusted) {
    if (!trusted || !enabled) fail('请先在 Termius 面板中开启 MCP 并共享会话');
    if (!valid(target)) fail('请选择一个可见且已连接的终端');
    revoke();
    const next = { id: randomId(), target, expires: now() + grantMs, dispose() {} };
    grant = next;
    try {
      next.dispose = subscribe(target, chunk => {
        if (grant !== next || !enabled) return;
        if (!valid(target) || now() >= next.expires) { revoke(); return; }
        if (typeof chunk !== 'string') return;
        buffer += chunk;
        if (buffer.length > 32768) { buffer = buffer.slice(-32768); dropped = true; }
      });
    } catch (e) { revoke(); fail('无法安全订阅该终端：' + (e && e.message ? e.message : String(e))); }
    changed(); return next.id;
  }
  function request(kind, args) {
    const g = check(args.session);
    if (pending) fail('已有另一个请求正在等待审批');
    if (kind === 'write') {
      if (typeof args.text !== 'string' || !args.text.length || args.text.length > 4096 || /[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(args.text)) fail('只接受可见文本、制表符和换行（最多 4096 字符）');
    } else if (kind !== 'read') fail('未知操作');
    const text = kind === 'read' ? buffer.slice(0, 8192) : args.text;
    // Consume this snapshot now; denial discards it. Later output is a separate request.
    const truncated = dropped || (kind === 'read' && buffer.length > 8192);
    if (kind === 'read') { buffer = ''; dropped = false; }
    // 自动批准：跳过应用内确认，上面的校验全部保留。可在面板上随时切回手动。
    if (auto) {
      try {
        if (kind === 'write') { send(g.target, text); return Promise.resolve({ sent: true, auto: true }); }
        return Promise.resolve({ text, truncated, auto: true });
      } catch (e) { return Promise.reject(e); }
    }
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
    if (!allowed) { cancel('已在 Termius 中拒绝'); changed(); return true; }
    try {
      if (now() >= p.deadline) fail('审批超时');
      const g = check(p.session);
      if (g.target !== p.target) fail('会话已切换');
      pending = null;
      if (p.kind === 'write') {
        try { send(g.target, p.text); } catch { fail('写入失败；命令可能已开始执行，请勿自动重试'); }
        p.resolve({ sent: true });
      }
      else {
        if (typeof approvedText !== 'string' || approvedText.length > 8192) fail('审核后的输出无效');
        p.resolve({ text: approvedText });
      }
    } catch (e) { pending = null; p.reject(e); }
    changed(); return true;
  }
  return {
    enable(trusted) { if (!trusted) fail('请使用 Termius 面板中的开关'); enabled = true; changed(); },
    disable, revoke, share, tick, request, decide, cancel,
    setAutoApprove(next) { auto = !!next; changed(); return auto; },
    status() { tick(); return { enabled, shared: !!grant, pending: !!pending, autoApprove: auto }; },
    sessions() { tick(); return grant ? [{ id: grant.id, label: '用户共享的终端', expiresAt: grant.expires }] : []; }
  };
}
