// Runs only inside Termius's primary renderer. No Node, network or credential APIs.
export function installRenderer(createPolicy, bridgeKey) {
  if (Object.hasOwn(globalThis, bridgeKey)) return { installed: true };
  const host = document.createElement('div');
  host.id = 'termius-session-mcp-panel';
  host.style.cssText = 'position:fixed;left:12px;top:300px;z-index:2147483647;-webkit-app-region:no-drag';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `:host{font:13px system-ui;color:#eef3ff}section{width:310px;background:#18202f;border:1px solid #66758d;border-radius:12px;padding:14px;box-shadow:0 6px 28px #0008}h2{font-size:14px;margin:0 0 9px}p{line-height:1.4;margin:8px 0;color:#c3cfdf}button{background:#344b69;border:1px solid #647a98;border-radius:6px;color:white;padding:7px 10px;margin:3px;cursor:pointer}button:disabled{opacity:.4;cursor:default}button.danger{background:#8c303b}textarea{box-sizing:border-box;width:100%;height:180px;background:#080e18;color:white;font:12px monospace;white-space:pre;overflow:auto}label{display:block;margin:9px 0}small{color:#bcc8da}#request{border-top:1px solid #637089;margin-top:10px;padding-top:8px}#request[hidden]{display:none}`;
  root.append(style);
  const layout = document.createElement('style');
  layout.textContent = `#mcp-launcher{display:flex;align-items:center;gap:10px;width:100%;margin:0;padding:10px 12px;text-align:left;font:600 13px system-ui;background:transparent;border:1px solid transparent;border-radius:8px}#mcp-launcher:hover,#mcp-launcher[aria-expanded="true"]{background:#394054;border-color:#58627a}#mcp-launcher:focus-visible,button:focus-visible{outline:2px solid #59b6ff;outline-offset:2px}#mcp-dot{width:8px;height:8px;border-radius:50%;background:#8992a5;flex:none}#mcp-dot[data-state="on"]{background:#54d9a3}#mcp-dot[data-state="pending"]{background:#ffcc66}section{position:fixed;box-sizing:border-box;width:min(340px,calc(100vw - 24px));max-height:calc(100vh - 90px);overflow:auto}section[hidden]{display:none}#mcp-close{float:right;margin:-5px -4px 0 6px;background:transparent;border:0;font-size:18px}h2{padding-top:3px}`;
  root.append(layout);
  const launcherButton = document.createElement('button'); launcherButton.id = 'mcp-launcher';
  launcherButton.setAttribute('aria-label', 'Termius MCP controls'); launcherButton.setAttribute('aria-expanded', 'false'); launcherButton.setAttribute('aria-controls', 'mcp-controls');
  const dot = document.createElement('span'); dot.id = 'mcp-dot'; dot.setAttribute('aria-hidden', 'true'); launcherButton.append(dot);
  const launcherLabel = document.createElement('span'); launcherLabel.textContent = 'MCP · Off'; launcherButton.append(launcherLabel); root.append(launcherButton);
  const panel = document.createElement('section'); panel.id = 'mcp-controls'; panel.hidden = true; root.append(panel);
  function position() {
    // Inspect navigation button labels only, never terminal text or scrollback.
    const logs = [...document.querySelectorAll('button,[role="button"]')].find(e => {
      const r = e.getBoundingClientRect();
      return r.left >= 0 && r.left < 120 && r.width > 25 && r.width < 300 && r.height > 15 && e.textContent?.trim() === 'Logs';
    });
    const r = logs?.getBoundingClientRect();
    const width = window.innerWidth || 1280, height = window.innerHeight || 800;
    // A compact top-bar button remains available while the sidebar is hidden.
    const left = r ? Math.max(8, r.left) : Math.min(270, width - 150);
    const top = r ? Math.min(r.bottom + 6, height - 50) : 8;
    host.style.left = left + 'px'; host.style.top = top + 'px'; host.style.width = (r ? Math.max(80, r.width) : 120) + 'px';
    panel.style.left = Math.max(12, Math.min(r ? r.right + 12 : left, width - 352)) + 'px';
    panel.style.top = Math.max(54, Math.min(top, height - 650)) + 'px';
  }
  function showPanel(open) { panel.hidden = !open; launcherButton.setAttribute('aria-expanded', String(open)); if (open) position(); }
  launcherButton.addEventListener('click', e => { if (e.isTrusted) showPanel(panel.hidden); });
  const el = (tag, text, parent = panel) => { const e = document.createElement(tag); if (text) e.textContent = text; parent.append(e); return e; };
  const close = el('button', '×'); close.id = 'mcp-close'; close.setAttribute('aria-label', 'Close MCP controls');
  close.addEventListener('click', e => { if (e.isTrusted) { showPanel(false); launcherButton.focus?.(); } });
  root.addEventListener('keydown', e => { if (e.isTrusted && e.key === 'Escape') { showPanel(false); launcherButton.focus?.(); } });
  el('h2', 'Termius Session MCP');
  const status = el('p', 'MCP is off');
  const toggle = el('button', 'Turn MCP on');
  const share = el('button', 'Share visible terminal');
  const revoke = el('button', 'Revoke');
  el('small', 'One visible terminal • 10-minute grant • approve every write and output release');
  const info = el('p', 'Credentials stay in Termius. Terminal output can still contain secrets.');
  const requestBox = el('div'); requestBox.id = 'request'; requestBox.hidden = true;
  const requestTitle = el('p', '', requestBox);
  const preview = el('textarea', '', requestBox); preview.setAttribute('aria-label', 'Review request'); preview.spellcheck = false;
  const label = el('label', '', requestBox);
  const check = el('input', '', label); check.type = 'checkbox'; label.append(document.createTextNode(' I reviewed the entire request'));
  const accept = el('button', 'Approve once', requestBox);
  const deny = el('button', 'Deny', requestBox); deny.className = 'danger';
  document.body.append(host);
  let displayed = null, policy;

  function visible(el) {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 10 && r.height > 10 && s.visibility === 'visible' && s.display !== 'none' && el.isConnected;
  }
  function mediator(el) {
    let n = el, fiber;
    for (let i = 0; n && i < 16; i++, n = n.parentElement) {
      const k = Object.keys(n).find(k => k.startsWith('__reactFiber$'));
      if (k) { fiber = n[k]; break; }
    }
    for (let i = 0; fiber && i < 40; i++, fiber = fiber.return) {
      const m = fiber.memoizedProps?.mediator;
      if (m?.id && typeof m.shell?.sendData === 'function' && typeof m._onShellOutput?.event === 'function') return m;
    }
    return null;
  }
  function selected() {
    const candidates = [...document.querySelectorAll('.terminal')].filter(visible);
    if (candidates.length !== 1) return null; // Fail closed for split panes or ambiguous tabs.
    const m = mediator(candidates[0]);
    if (!m || !m._currentConnection) return null;
    return { m, element: candidates[0], connection: m._currentConnection, shell: m.shell };
  }
  function valid(t) {
    if (document.visibilityState !== 'visible' || !host.isConnected) return false;
    const s = selected();
    return !!s && s.m === t.m && s.element === t.element && s.connection === t.connection && s.shell === t.shell;
  }
  function update() {
    if (!policy) return;
    // Avoid recursive tick/status notifications.
    const s = policy.status();
    status.textContent = !s.enabled ? 'MCP is off' : s.shared ? 'MCP on · one terminal shared' : 'MCP on · no terminal shared';
    launcherLabel.textContent = s.pending ? 'MCP · Review' : s.enabled ? 'MCP · On' : 'MCP · Off';
    dot.setAttribute('data-state', s.pending ? 'pending' : s.enabled ? 'on' : 'off');
    toggle.textContent = s.enabled ? 'Turn MCP off' : 'Turn MCP on';
    toggle.className = s.enabled ? 'danger' : '';
    share.disabled = !s.enabled; revoke.disabled = !s.shared;
    if (!s.pending) { displayed = null; preview.value = ''; requestBox.hidden = true; check.checked = false; }
    accept.disabled = !check.checked;
  }
  policy = createPolicy({
    now: () => Date.now(), randomId: () => crypto.randomUUID(), changed: () => queueMicrotask(update), valid,
    subscribe(t, cb) {
      const sub = t.m._onShellOutput.event(cb);
      if (!sub || typeof sub.dispose !== 'function') throw new Error('No disposable output subscription');
      const listeners = [sub];
      const dispose = () => { for (const l of listeners) { try { l?.dispose(); } catch {} } };
      try {
        for (const name of ['_onDisconnect', '_onExit']) {
          if (typeof t.m[name]?.event !== 'function') throw new Error('Disconnect lifecycle is unsupported');
          const listener = t.m[name].event(() => policy.revoke());
          if (!listener || typeof listener.dispose !== 'function') throw new Error('Disconnect lifecycle is unsupported');
          listeners.push(listener);
        }
      } catch (e) { dispose(); throw e; }
      return dispose;
    },
    send(t, text) { t.shell.sendData(text); },
    approve(r) {
      showPanel(true);
      displayed = r; requestBox.hidden = false; check.checked = false;
      requestTitle.textContent = r.kind === 'write' ? 'Send this exact text to the shared terminal? Newlines may execute commands.' : 'Release this output to the AI? Remove any secrets below before approving.';
      // Escape controls visually on reads. Do not let terminal escape sequences spoof the review.
      preview.value = r.kind === 'write' ? r.text : r.text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/gu, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
      preview.maxLength = 8192; preview.readOnly = r.kind === 'write';
      info.textContent = r.truncated ? 'Output was limited. Only the text shown here can be released.' : 'Approval expires in 30 seconds. Switching tabs revokes access.';
    }
  });
  toggle.addEventListener('click', e => { if (!e.isTrusted) return; if (policy.status().enabled) policy.disable(); else policy.enable(true); });
  share.addEventListener('click', e => {
    if (!e.isTrusted) return;
    try { const t = selected(); if (!t) throw new Error('Focus one terminal. Split panes and unsupported versions are refused.'); policy.share(t, true); info.textContent = 'Sharing starts now. Earlier scrollback is never collected.'; }
    catch (error) { info.textContent = error.message; }
  });
  revoke.addEventListener('click', e => { if (e.isTrusted) policy.revoke(); });
  check.addEventListener('change', e => { if (!e.isTrusted) check.checked = false; update(); });
  accept.addEventListener('click', e => {
    if (!e.isTrusted || !check.checked || !displayed || !document.hasFocus()) return;
    policy.decide(displayed.id, true, true, preview.value);
  });
  deny.addEventListener('click', e => { if (e.isTrusted && displayed) policy.decide(displayed.id, false, true); });
  // A backgrounded/minimized app drops the grant and any pending work.
  const hide = () => { if (document.visibilityState !== 'visible') policy.disable(); };
  document.addEventListener('visibilitychange', hide);
  let positionTicks = 0;
  position(); window.addEventListener('resize', position);
  const timer = setInterval(() => { policy.tick(); if (!host.isConnected) policy.disable(); if (++positionTicks % 8 === 0) position(); }, 250);
  const dispatch = async (method, args = {}) => {
    if (method === 'status') return policy.status();
    if (method === 'sessions') return policy.sessions();
    if (method === 'read' || method === 'write') return policy.request(method, args);
    if (method === 'cancel') { policy.cancel(); return {}; }
    if (method === 'disable') { policy.disable(); return {}; }
    throw new Error('Unsupported operation');
  };
  Object.defineProperty(globalThis, bridgeKey, { value: dispatch, configurable: false, writable: false });
  window.addEventListener('pagehide', () => { clearInterval(timer); policy.disable(); }, { once: true });
  update();
  return { installed: true };
}
