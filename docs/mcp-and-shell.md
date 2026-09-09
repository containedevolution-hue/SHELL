# MCP and SHELL

How Tenari consumes local tools through SHELL, and how Tenari may expose scoped capabilities to approved external AI clients.

**Built:**
- Local-tools rules set: pairing discovers a tool surface but proves neither reachability nor permission; filesystem access is jailed to explicitly shared roots with separate read/write grants; browser access is default-deny; Local Access (not the Companion) controls machine grants, auditable and fail-closed; remote-tunnel entitlement and local/LAN capability are checked separately
- Tenari-as-MCP-server rules set: external access uses user-owned scoped revocable tokens stored as hashes; Memory reads use the canonical retrieval boundary; proposed Memory enters Ripening, never a direct canonical write by an external model

**Not built yet:**
None — these are settled policy rules; the underlying Memory MCP implementation is owned by Tenari's own Memory-Grove/Semantic-Recall docs.
