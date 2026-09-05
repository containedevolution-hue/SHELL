# System Dashboard

SHELL's System Dashboard is the user-facing task manager: a customizable vehicle-style instrument panel that explains, predicts, and controls system activity without requiring the user to understand operating-system internals.

## Contract

- The default dashboard shows only gauges that help a person make a decision. Advanced process, service, thread, handle, and diagnostic views are available deliberately rather than flooding the first layer.
- Supported gauges cover processor, memory, storage, network, battery and power, temperature, applications, background work, workflow queues, local models, external-provider reach, and estimated or settled paid usage. A missing sensor or unsupported limit is stated rather than estimated as fact.
- Every gauge opens an explanation of what it measures, its source, freshness, normal and warning ranges, recent trend, what consumes it, and which actions are safe. Estimates are labeled separately from readings and settled costs.
- Users may rearrange, resize, group, hide, and restore gauges; choose supported warnings; and set limits where the underlying subsystem can enforce them. Presets and reset-to-default remain available.
- A limit states its consequence before saving: slow, queue, pause, stop, deny new work, reduce model size, require approval, or warn only. No decorative control pretends to enforce a boundary.
- Applications, workflows, connectors, and models report usage through versioned SHELL telemetry rather than scraping private content. User documents, prompts, credentials, and workflow payloads never appear in system telemetry.
- The dashboard links an unhealthy credential or blocked workflow to the same repair state summarized by the Top Bar. It does not create a second health authority.
- SHELL's Core reuses this telemetry contract for its gauge layer. Core-section size, index state, Trunk connection activity, and backup/sync queues follow the same source, freshness, privacy, and action rules rather than creating decorative gauges.
- Stopping work distinguishes safe cancellation, force stop, unsupported interruption, and an external effect whose outcome is still unknown. It explains known partial data effects, never presents process exit as effect rollback, and ends with fresh verification that the worker stopped and owned resources and unused cost authorizations were released.

## Next Builds

1. Specify the gauge and telemetry contract, including source, units, sampling, freshness, privacy class, warning ranges, supported limits, and verification.
2. Prototype default, customized, constrained-resource, expired-credential, paid-work, and unsupported-sensor dashboards before selecting the final visual treatment.
3. Prove one application, workflow, and local model can be limited and stopped without stale gauges, leaked payloads, duplicate work, or stranded resources.
