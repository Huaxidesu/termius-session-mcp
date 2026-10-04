# Validation status

This is an experimental prototype, not a verified Termius release.

## Automated checks

All 18 Node tests passed on Windows on 2026-10-04. The suite exercises policy and renderer behavior with test doubles, MCP initialization and framing, strict target selection, and authentication over a real local pipe. These checks do not establish compatibility with a real Termius session.

## Live environment

Windows desktop with Termius 9.39.0. Its executable signature was valid during inspection. The application archive and integrity fuses were not modified. No credential storage was accessed or decrypted.

The user confirmed successful launch after the launcher corrections and supplied a screenshot showing Termius with the original MCP panel in its disabled state. The subsequent compact sidebar button layout is awaiting user confirmation. No live terminal sharing, SSH command execution, or in-app consent flow has passed end-to-end validation, and the MCP has not been activated in the user's client configuration.

The added shortcut now keeps launch errors visible. `launcher.log` in the checkout contains startup stages and launcher errors, never terminal output. The file is excluded from Git. It may contain local filesystem paths; inspect it before sharing it.

## Release gate

Before enabling this integration for real infrastructure, verify successful launch, an initially disabled panel, explicit sharing of one terminal, denial and approval of separate read/write requests, output redaction, expiry, cancellation, tab switching, disconnect revocation, and normal exit. Revalidate internal object matching after any Termius update.
