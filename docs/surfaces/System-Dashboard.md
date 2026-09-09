# System Dashboard

SHELL's user-facing task manager — a customizable vehicle-style instrument panel explaining, predicting, and controlling system activity.

**Built:**
- A contract decided: a minimal default gauge set (only decision-relevant gauges, advanced views available deliberately); supported gauge categories (processor/memory/storage/network/battery/temperature/apps/background work/queues/local models/provider reach/paid usage); every gauge opens an explanation (source, freshness, ranges, trend, safe actions) with estimates labeled separately from settled costs
- User controls decided: rearrange/resize/group/hide/restore gauges, supported warnings, and enforceable limits that state their consequence before saving (slow/queue/pause/stop/deny/reduce/require-approval/warn-only)
- A telemetry rule enforced: versioned SHELL telemetry only, never scraping user documents/prompts/credentials/workflow payloads; the dashboard shares one health authority with the adaptive Status Bar; SHELL's Core reuses this same contract for its own gauge layer
- A stop-work model decided: distinguishes safe cancellation, force stop, unsupported interruption, and unknown external outcomes, always ending in fresh verification of worker/resource release

**Not built yet:**
- The gauge/telemetry contract specification itself (source, units, sampling, freshness, privacy class, warning ranges, supported limits, verification)
- Prototyping default/customized/constrained/expired-credential/paid-work/unsupported-sensor dashboard states
- Proving one real app, workflow, or local model can actually be limited and stopped cleanly
