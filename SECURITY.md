# Security model

This is experimental software. Do not equate passing tests with an independent security audit.

## Assets and trust

Protected by design: Termius credentials and vault storage are never read by this code. Terminal data stays in renderer memory until a reviewed snapshot is approved. Grants, pending operations and terminal output are not persisted by this project. The runtime file stores a random IPC authentication token and pipe address, not SSH credentials.

Trusted components: Windows account, Termius and its renderer, local source checkout, Node executable, launcher, human approving actions, and OS process/handle isolation. The private CDP pipe gives the launcher broad renderer authority; the MCP client receives only four constrained operations. This is not a boundary against administrators, same-user malware, a compromised renderer, or an agent with independent shell access to these processes/files.

## Transport

Termius is launched with `--remote-debugging-pipe`, not a TCP port. The launcher exposes a random Windows named pipe with a separate 256-bit bearer token. `setup.ps1` creates a state directory with a protected current-user/SYSTEM DACL; the launcher checks that DACL and ownership before creating its endpoint. IPC authentication is checked before any renderer operation. Frames, connections, pending operations and timeouts are bounded. No HTTP listener, telemetry, cloud broker or external service is used by this project.

Windows named-pipe security is not claimed to exclude every remote SMB client: Node does not expose `PIPE_REJECT_REMOTE_CLIENTS`. An unauthenticated client still needs the unpredictable pipe name and token, and each sensitive operation needs human approval. Normal Windows/firewall policy remains in force and is never changed by setup.

## Consent and session binding

The panel starts off. Enable/share/approve handlers require trusted UI events. The MCP API cannot enable, share or approve. Sharing captures an exact visible DOM element, mediator, shell and connection object; they are revalidated at request time, on approval, while collecting output and on a 250ms timer. Switching tabs, disconnect events, hidden document, expiry or removal of the panel revokes access. Only one visible terminal is supported; split layouts fail closed. The system does not discover background terminals or enumerate saved hosts.

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
