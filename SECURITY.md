# Security model

> **⚠️ 本 fork 关闭了人工审批环节（LOCAL FORK — APPROVAL GATE DISABLED）**
>
> `autoApprove: true` 使 `write` 立即执行、`read` 立即释放，**不再有应用内确认**。因此本文件下文所有以“需要用户批准”为前提的保护性描述（例如 “until a reviewed snapshot is approved”、“each sensitive operation needs human approval”、“approval must come from the user”）**在本 fork 中不再成立**。
>
> 仍然有效的保护：授权 24 小时到期、切换标签页即撤销、断开连接即撤销、只认单一可见终端、控制字符拒绝、8192 字符读取上限、32KB 输出缓冲上限、随机 pipe 名与 64 位十六进制 token 认证。
>
> 本 fork 同时**取消了「文档不可见即撤销」**：窗口最小化或被其它窗口完全遮挡不再中断共享。这削弱了「用户此刻看着终端」这一隐含前提，换取可用性。
>
> 仍然成立的风险，且被放大：共享期间 AI 可以执行该 shell 账号能做的任何事，包括删除、提权失败后的试探、外联下载；读取的输出会原样进入模型上下文，本项目不做敏感信息检测。

This is experimental software. Do not equate passing tests with an independent security audit.

## Assets and trust

Protected by design: Termius credentials and vault storage are never read by this code. Terminal data stays in renderer memory until a reviewed snapshot is approved. Grants, pending operations and terminal output are not persisted by this project. The runtime file stores a random IPC authentication token and pipe address, not SSH credentials.

Trusted components: Windows account, Termius and its renderer, local source checkout, Node executable, launcher, human approving actions, and OS process/handle isolation. The private CDP pipe gives the launcher broad renderer authority; the MCP client receives only four constrained operations. This is not a boundary against administrators, same-user malware, a compromised renderer, or an agent with independent shell access to these processes/files.

## Transport

Termius is launched with `--remote-debugging-pipe`, not a TCP port. The launcher exposes a random Windows named pipe with a separate 256-bit bearer token. `setup.ps1` creates a state directory with a protected current-user/SYSTEM DACL; the launcher checks that DACL and ownership before creating its endpoint. IPC authentication is checked before any renderer operation. Frames, connections, pending operations and timeouts are bounded. No HTTP listener, telemetry, cloud broker or external service is used by this project.

Windows named-pipe security is not claimed to exclude every remote SMB client: Node does not expose `PIPE_REJECT_REMOTE_CLIENTS`. An unauthenticated client still needs the unpredictable pipe name and token, and each sensitive operation needs human approval. Normal Windows/firewall policy remains in force and is never changed by setup.

## Consent and session binding

The panel starts off. Enable/share/approve handlers require trusted UI events. The MCP API cannot enable, share or approve. Sharing captures an exact visible DOM element, mediator, shell and connection object; they are revalidated at request time, on approval, while collecting output and on a 250ms timer. Switching tabs, disconnect events, expiry or removal of the panel revokes access. This fork removed the hidden-document check; see the warning at the top. Only one visible terminal is supported; split layouts fail closed. The system does not discover background terminals or enumerate saved hosts.

One request may await consent. It expires after 30 seconds. Writes are exact strings, not templates or expressions. Control characters and bidi direction controls are rejected. A read snapshot is bounded to 8192 characters, consumed on request, displayed in an editable preview with controls escaped, and released only after confirmation. New output cannot be appended to a snapshot after review. Turning off rejects pending work and disposes the output subscription. Delivered commands and already released content cannot be recalled.

## Remaining risks

- Internal Termius fields may change. Compatibility failures refuse sharing, but independent review and live-version testing are still needed.
- A terminal process can print misleading text. Treat all output as untrusted; approval must come from the user, not instructions in a log.
- Human approval can approve a harmful command or overlook a secret. Output redaction is manual.
- A compromised same-user process can tamper with source/configuration or drive UI. `isTrusted` is not a defense against OS-level input automation or a holder of the private CDP pipe.
- Reconnection that reuses all captured object identities may not be detectable unless Termius emits a disconnect event. The disposable disconnect/exit event hooks and short grant lifetime reduce this risk; do not use for unattended production access.
- IPC request flooding can cause denial of service. Limits reduce memory growth; they cannot eliminate local resource exhaustion.
- The launcher remains privileged even while the panel is off. Off disables the MCP policy, not OS-level debugger authority. Fully exit and relaunch Termius normally to remove the integration.
- Closing the launcher pipe may close Termius. Keep the launcher alive while using its sessions.

## Reporting

For a vulnerability, use GitHub private vulnerability reporting when enabled. Do not include real credentials, terminal content, host addresses or private logs in public issues. If private reporting is unavailable, open a minimal contact request without exploit details.
