# System Dashboard

CEE OS's user-facing task manager — a customizable vehicle-style instrument panel explaining, predicting, and controlling system activity.

**Built:**
- A contract decided: a minimal default gauge set (only decision-relevant gauges, advanced views available deliberately); supported gauge categories (processor/memory/storage/network/battery/temperature/apps/background work/queues/local models/provider reach/paid usage); every gauge opens an explanation (source, freshness, ranges, trend, safe actions) with estimates labeled separately from settled costs
- The surface composition is decided: vertically scrollable gauge rails surround a large center; selecting Status, Warnings, Workflows, Permissions, Limits, or Priorities replaces the center without hiding the surrounding measurements. Priority distinguishes protected Core services required for operation from ordinary user-selected background work.
- User controls decided: rearrange/resize/group/hide/restore gauges, supported warnings, and enforceable limits that state their consequence before saving (slow/queue/pause/stop/deny/reduce/require-approval/warn-only)
- A telemetry rule enforced: versioned SHELL telemetry only, never scraping user documents/prompts/credentials/workflow payloads; the dashboard shares one health authority with the adaptive Status Bar; SHELL's Core reuses this same contract for its own gauge layer
- A stop-work model decided: distinguishes safe cancellation, force stop, unsupported interruption, and unknown external outcomes, always ending in fresh verification of worker/resource release
- App lifecycle is decided independently from window visibility: after autosave, ordinary apps may freeze while remaining visibly open and resume on interaction. Per-app choices are Pause when inactive, Pause when minimized, Pause after a chosen delay, Always on while its Powerhouse is active, or Always on while the computer is powered; background execution requires a separate grant.
- Core relationship is decided separately from lifecycle: an app without a Core data grant knows nothing about the user and starts as new. Specialty apps may own explicitly selected heavy app state, while an online/public profile is a scoped projection edited and synchronized from Core rather than ambient Core access. Core can be taken wholly offline or brought online by one explicit user control.
- Warning response is decided: create a diagnostic checkpoint, preserve the prior Last Good State, explain the evidence and likely impact, offer actions, and state CEE OS's recommended action with situational reasoning. An abnormal checkpoint is never silently promoted.

**Not built yet:**
- The gauge/telemetry contract specification itself (source, units, sampling, freshness, privacy class, warning ranges, supported limits, verification)
- Prototyping default/customized/constrained/expired-credential/paid-work/unsupported-sensor dashboard states
- Proving one real app, workflow, or local model can actually be limited and stopped cleanly
- Connecting the current gauge-rail preview to live cgroup/pressure evidence and implementing the center's warning, workflow, permission, and priority actions
