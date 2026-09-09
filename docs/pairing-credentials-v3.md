# Pairing Credentials v3

Makes legacy optional pairing finite, revocable, rotatable, and fail-closed — not a new phone/remote-control runtime.

**Built:**
- `pairing.json` implemented: SHA-256 verifiers, issue/expiry/revocation times, generation numbers, no stored bearer values; a v2 file migrates atomically; rotation/unpair invalidate every earlier identity, sync, and MCP bearer at once
- Outbound identity isolated into `pairing.outbound.json`, host-protected as best-effort (Windows ACL/owner-only mode, Linux/macOS `0600`) — explicitly not OS-vault protected yet; status reports this honestly as `filesystem-permissions`
- Atomic generation-bound writes with last-known-good backups implemented; a partial two-file update triggers `reconciliation-required` rather than a mixed generation; status/logs never expose bearer values
- Rotate/Unpair actions exposed through the authenticated `main` window, each producing one single-use replacement bundle

**Not built yet:**
- Moving the outbound identity into DPAPI/Secret Service/Keychain (needs an OS-specific secret-store adapter and its own acceptance evidence)
