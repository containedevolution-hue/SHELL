# Pairing and Reach

Settings pairs a local SHELL with a Tenari account. Local/LAN storage remains free; remote Companion access through the public tunnel is PASS-gated.

## Contract

- SHELL displays a rotating six-hex local code. Settings claims the discovered device with that code; successful claim removes it, and repeated wrong attempts lock and delete the beacon.
- Appliance identity, browser sync, and remote MCP use separate credentials. Legacy shared credentials require rotation through local-code pairing.
- Forwarding headers cannot make a tunnel request inherit loopback trust.
- Loopback is never sufficient to authorize MCP, sync, Flow, speech, asset, or
  access-setting mutations. Bundled Shell windows use expiring scoped local
  sessions; appliance clients send the paired capability credential.
- Pairing reports endpoint, LAN, and MCP reach separately.
- Unpair removes remote and LAN endpoints plus appliance, sync, and MCP credentials together.
- Public pairing status never returns a credential.
- [Credential v3](pairing-credentials-v3.md) hashes inbound bearers, expires each
  generation after 30 days, and provides exact-local rotate/unpair operations.

Pairing proves neither local permission nor current reach. The Settings Companion Reach panel is owned by `Tenari/memory/product-surfaces/Settings.md`.
