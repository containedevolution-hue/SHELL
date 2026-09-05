# MCP and SHELL

Tenari consumes permissioned local tools through SHELL and may expose narrowly scoped user-owned capabilities to approved external AI clients.

## Local tools

- Pairing discovers a tool surface; it does not prove reachability or grant permission.
- Filesystem access is jailed to explicitly shared roots. Read and write are separate grants.
- Browser access is default-deny and limited to locally approved reach.
- Pairing does not imply permanent deletion, arbitrary commands, or whole-machine control.
- Local Access—not the Companion—controls machine grants. Calls are auditable and fail closed when approval or reach is missing.
- Remote tunnel entitlement and local/LAN capability are separate checks.

## Tenari as an MCP server

- External access uses user-owned, scoped, revocable tokens stored as hashes.
- Memory reads use the canonical Memory retrieval boundary.
- Proposed Memory enters Ripening; an external model cannot write canonical User Memory directly.
- Memory MCP work is owned by `Tenari/memory/memory-tree/Memory-Grove.md` and `memory/memory-tree/Semantic-Recall-and-MCP.md`.

MCP does not bypass a service's OAuth, security, licensing, data-use, rate-limit, cost, or legal requirements. Prefer a simpler documented transport when it provides the needed capability with a clearer permission boundary.
