# Status Bar

The Status Bar is Shell's persistent, adaptive system surface. On a phone-sized display it is the dark bar directly beneath the device's native time, network, and battery indicators. Pink is its accent and outline, not the bar itself. On a Shell desktop it occupies the equivalent persistent top-level system position without copying a mobile operating-system status strip.

The Status Bar is comparable in persistence to the Windows taskbar, but not in behavior. Its visible controls and summaries change according to the active main surface and the person's Core settings. Shell owns the bar, its state, permissions, system alerts, and contribution contract. An app may contribute bounded actions or status through that contract; no app owns, duplicates, or independently recolors system truth.

Chat consumes the Status Bar as a host capability. When Chat is active, the bar may summarize the current desk, remote execution connection, notifications, connection health, or settings selected by Core. Those summaries remain Shell observations. Chat's API, MCP, local-model, subscription, and Seed instruments live in the Chat Lab below the bar and do not become a second system-status authority.

Standalone apps and non-Shell hosts may render an appropriate frame from the same bounded status contract when it exists. Absence of the contract is an explicit unavailable state, never permission to fabricate Shell status.

The [Chat host protocol v1](../../contracts/chat/README.md) now defines the portable observation and contribution boundary. It is source-published and tested. The live adaptive Status Bar implementation and native transport remain queued; contract availability alone must not be advertised as a connected host.
