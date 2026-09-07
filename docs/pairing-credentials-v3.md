# Pairing credentials v3

Version 3 makes legacy optional pairing finite, revocable, rotatable, and fail-closed. It does not create a phone or remote-control runtime.

`pairing.json` stores SHA-256 verifiers, issue/expiry/revocation times, and a generation number. It never stores the inbound sync or MCP bearer. A v2 file migrates atomically without changing its current bearer values, so an existing client continues until the new 30-day expiry. Rotation and unpair replace the entire generation, immediately invalidating every earlier identity, sync, and MCP bearer.

The optional legacy integration must resend its identity bearer for outbound registration. Shell therefore isolates that one value in `pairing.outbound.json`; it is not encrypted and is not described as OS-vault protected. Current host protection is:

- Windows: the file inherits the packaged per-user app-data directory ACL. Node requests owner-only mode, but Windows does not interpret POSIX mode bits as DPAPI protection.
- Linux: Shell requests mode `0600`; the file is not stored in Secret Service.
- macOS: Shell requests mode `0600`; the file is not stored in Keychain, and the packaged path remains unverified.

Status reports this honestly as `filesystem-permissions`. Moving the outbound identity into DPAPI, Secret Service, and Keychain requires an OS-specific secret-store adapter and separate acceptance evidence. Until then, disclosure of the outbound file requires immediate local rotation or unpair.

Pairing state and outbound identity use generation-bound files, atomic temporary writes, and last-known-good backups. A partial two-file update cannot authorize a mixed generation: restart reconciles the matching backup or reports `reconciliation-required` and rejects every credential. Status and logs expose state and expiry only—never bearer values, hashes, or ciphertext.

The local Shell Connections surface exposes explicit **Rotate credentials** and **Unpair** actions through the exact authenticated `main` window. Rotation downloads the only replacement bundle produced for that generation; Shell does not persist inbound sync or MCP bearer values after restart. Treat the bundle as a secret and remove it after configuring intended clients.
