# Status Bar

The Status Bar is Shell's persistent, adaptive system surface. On a phone-sized display it is the dark bar directly beneath the device's native time, network, and battery indicators. Pink is its accent and outline, not the bar itself. On a Shell desktop it occupies the equivalent persistent top-level system position without copying a mobile operating-system status strip.

The Status Bar is comparable in persistence to the Windows taskbar, but not in behavior. Its visible controls and summaries change according to the active main surface and the person's Core settings. Shell owns the bar, its state, permissions, system alerts, and contribution contract. An app may contribute bounded actions or status through that contract; no app owns, duplicates, or independently recolors system truth.

The bar is the shared home for the active surface's toolbox, options, workspace controls, settings action, and notifications. The surface below it supplies bounded contributions and occupies the remaining app area; it does not add a second top toolbar. Changing apps or navigating a multi-page product such as Brics replaces the contribution while preserving the same Shell-owned bar, geometry, notification authority, and user-selected separator line.

The owner's 2026-09-09 desktop revision fixes Home at the exact horizontal centre: the separator line dips and curves around a circle containing a globe, a home symbol and a square outline around that symbol to signify Desktop. It remains in place on every page and returns to Desktop without closing applications. Active-page contributions cannot replace or cover this control.

Settings is contextual. From Desktop it opens base Shell settings; from Scribble it opens Scribble settings; other pages supply their own settings destination. Opening a menu retains that page's context. Global system observations and notifications remain Shell-owned even when the menus change. The [desktop layout](Desktop.md) records the current scope and interactive study; the study demonstrates routing only and is not a live app contribution transport.

Chat consumes the Status Bar as a host capability. When Chat is active, the bar may summarize the current desk, remote execution connection, notifications, connection health, or settings selected by Core. Those summaries remain Shell observations. Chat's API, MCP, local-model, subscription, and Seed instruments live in the Chat Lab below the bar and do not become a second system-status authority.

Standalone apps and non-Shell hosts may render an appropriate frame from the same bounded status contract when it exists. Absence of the contract is an explicit unavailable state, never permission to fabricate Shell status.

The [Chat native desk protocol v2](../../contracts/chat/README.md) now defines the portable observation, contribution, and complete-client window boundary. It is source-published and tested. The live adaptive Status Bar and compositor transport remain queued; contract availability alone must not be advertised as a connected host.
