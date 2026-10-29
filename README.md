# Termius Session MCP

An unofficial, experimental Windows integration that lets an MCP client work with **one terminal you explicitly share in Termius**. SSH authentication, passwords, private keys and vault encryption remain managed by Termius. This project does not call vault APIs, inspect credential storage or export keys.

**Current status: launch and the original disabled panel were confirmed on Termius 9.39.0. Live terminal operations remain unverified.** See [VALIDATION.md](VALIDATION.md).

## What it does

- Adds a compact **MCP** button below **Logs**, opening controls on demand. When the sidebar is hidden, the button moves to the top bar. Approval requests open the controls automatically.
- Starts **off** on every launch or renderer reload. Only a real UI interaction can enable sharing.
- Shares one visible terminal for **24 hours** per grant. Split panes and ambiguous terminal selection fail closed.
- **This local build auto-approves.** Writes execute and reads are released without an in-app confirmation step. See [Local modifications](#local-modifications-本fork的改动).
- Collects only output produced after sharing. It never reads earlier scrollback or subscribes to other terminals.
- Turning MCP off revokes the session, rejects pending requests, clears buffered output and disposes subscriptions. It cannot undo a command already sent.
- Uses an inherited private Chromium debugging **pipe**, never a TCP debugging port. Application archives, signatures, encryption and integrity fuses remain unchanged.
- Has **zero third-party runtime dependencies**. It implements a small MCP stdio subset (protocol 2025-06-18).

## Requirements

Windows, Node.js 22 or newer, and the desktop version of Termius. This is an internal-API integration, not an official Termius extension. Other versions may not expose compatible terminal objects; the integration refuses sharing when it cannot identify them.

The launcher must own the private pipe from process startup. **Fully exit Termius before launching it this way.** Do not close an active launcher while you need its SSH sessions: closing the private debugging pipe can cause Electron to exit. Closing an MCP client does not close the launcher or Termius.

## Setup

From a trusted, reviewed checkout, run in PowerShell (substitute your actual Termius path):

```powershell
.\scripts\setup.ps1 -TermiusExe 'C:\Path\To\Termius.exe'
```

This creates a private state directory under `%LOCALAPPDATA%\TermiusSessionMCP`, restricted to your Windows account and SYSTEM. It creates a **Termius with Session MCP** shortcut and `mcp-config.local.json` in `scripts/`. The latter contains paths only; do not commit machine-specific configuration.

Use the new shortcut to start Termius. In your MCP client's configuration, add the entry shown in `mcp-config.local.json`. The equivalent stdio command is:

```text
node C:\Path\To\termius-session-mcp\src\client.js C:\Users\You\AppData\Local\TermiusSessionMCP
```

For Codex, merge an entry like this into your MCP configuration:

```toml
[mcp_servers.termius_session]
command = 'C:\Path\To\node.exe'
args = ['C:\Path\To\termius-session-mcp\src\client.js', 'C:\Users\You\AppData\Local\TermiusSessionMCP']
tool_timeout_sec = 45
```

## Use

1. Open a terminal yourself in Termius. SSH authentication happens normally inside Termius.
2. Click **MCP**, then **Turn MCP on** and **Share visible terminal**.
3. Ask the AI to use `sessions`, then `read` or `write` with the returned opaque session ID.
4. Review the complete request in Termius, check the review box, and click **Approve once** or **Deny**. On reads, remove sensitive material in the preview before approving.
5. Click **Turn MCP off** when finished. Changing the visible terminal, disconnecting, minimizing the app or exceeding the grant lifetime also revokes access.

Only four MCP tools exist: `status`, `sessions`, `read`, `write`. There is no raw JavaScript, arbitrary CDP, vault, host inventory, file transfer, new-terminal, or key-export tool. Raw control characters (including Escape, carriage return and Ctrl+C) are refused; LF newlines and tabs are permitted. Commands may still do anything your shell account can do, after your approval.

Closing the controls only collapses the interface. Use **Turn MCP off** to revoke access. The button always shows **Off**, **On**, or **Review**. Source updates require closing Termius and reopening it with the launcher.

## Security boundaries

Read [SECURITY.md](SECURITY.md) before connecting real infrastructure. This is defense in depth, **not a sandbox or a security certification**. A compromised launcher, your Windows account, Termius renderer, or an administrator can bypass its policy. The launcher holds a privileged debugging pipe; that handle is not exposed through the MCP protocol. An AI that already has unrestricted local shell access must not be treated as contained by this MCP.

Terminal output may contain passwords, tokens or private information. The project does not promise automatic secret detection. **Only release output you have reviewed.** Your MCP client/provider may retain any text you approve. Shell commands can themselves disclose or modify data; there is no reliable universal safe-command filter.

## Testing

```text
node --test
```

Tests cover the consent policy, revocation, expiry, changing targets, snapshot isolation, bounded data, cancellation, framing and MCP lifecycle. They do not imply that every Termius release or SSH workflow is supported. See [VALIDATION.md](VALIDATION.md) for the tested environment and remaining limitations.

## Removal and recovery

Exit Termius normally and remove the MCP client entry and the added shortcut. Launch Termius with its original shortcut; the panel will not be present. No vendor files need restoring. The private state directory can be removed after the launcher exits. A crashed launcher can leave `endpoint.json`; first verify its recorded launcher PID is no longer running before removing that one stale file. Do not remove state belonging to a live launcher.

## Local modifications 本 fork 的改动

This is a personal fork. It differs from upstream in the following ways; everything else is unchanged.

| 改动 | 说明 | 位置 |
|---|---|---|
| 自动批准 | `autoApprove` 跳过每次写入/读取的审批框，命令直接执行 | `src/policy.js` `request()` |
| 授权 24 小时 | 共享时长从 10 分钟改为 24 小时，可由 `grantMs` 参数覆盖 | `src/policy.js` `createPolicy()` |
| 界面汉化 | 面板按钮、状态、错误提示改为中文；`Logs` 按钮识别兼容中文「日志」 | `src/renderer.js` |
| 事件 API 兼容 | `.event()` 同时接受裸解绑函数与 `{ dispose() }`；`_onExit` 在 Termius 10.x 已移除，降级为可选 | `src/renderer.js` `subscribe()` |
| 启动环境修正 | spawn Termius 时剔除 `ELECTRON_RUN_AS_NODE` / `NODE_OPTIONS`，否则 Electron 退化成纯 Node 并拒绝 `--remote-debugging-pipe` | `src/launcher.js` |
| ACL 回退 | `Set-Acl` 需要 SeRestorePrivilege，失败时改用 `icacls` 只授权当前用户与 SYSTEM | `scripts/setup.ps1` |
| 新增探针 | 命令行调用 `status` / `sessions` / `--run "命令"`，MCP 未加载时兜底 | `probe.js` |
| 新增重建脚本 | 仓库移动路径后重建快捷方式与客户端配置 | `scripts/rebuild-shortcuts.ps1` |

**安全影响**：移除审批门意味着 AI 发来的任何命令都会立即在共享终端执行，读取的输出也会立即释放，不再有人工拦截。吊销手段仅剩：撤回授权、切换标签页、断开连接、窗口不可见、24 小时到期。上游 README 中关于“每次操作都需人工确认”的承诺在此 fork 中不再成立。

## License and attribution

MIT. Termius is a trademark of its owner; this project is not affiliated with or endorsed by Termius. The implementation was written for this project. Research into live-terminal integration included [yapp/termius-mcp](https://github.com/yapp/termius-mcp); its source and Termius proprietary files are not bundled.
