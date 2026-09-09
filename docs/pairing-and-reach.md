# Pairing and Reach

How Settings pairs a local SHELL with a Tenari account, and how local/LAN and remote tunnel access are governed.

**Built:**
- Contract set: a rotating six-hex local code claims a discovered device; appliance/browser-sync/remote-MCP each use separate credentials; legacy shared credentials require rotation through local-code pairing; forwarding headers can never grant loopback trust to a tunnel request; every mutation-capable route needs a scoped session or paired credential, never bare loopback; pairing reports endpoint/LAN/MCP reach separately; unpair removes every credential together; public pairing status never returns a credential

**Not built yet:**
None — this is the settled contract; see `pairing-credentials-v3.md` for the credential implementation and `Tenari/.../Settings.md` for the Companion Reach panel.
