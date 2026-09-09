# SHELL Workflow Automation

Builds Automations as SHELL's local-first workflow system, exposed through Tenari in a lighter host-compatible form. Product behavior is owned by `Apps/apps/automations`; this order owns only the cross-system execution sequence.

**Built:**
- Foundation decisions made: benchmark against n8n/Activepieces/Node-RED/Zapier/Make/Pipedream without embedding restrictively-licensed code (n8n's Sustainable Use License and Automatisch/Windmill's AGPL are references only); SHELL's own workflow schema, grants, credential custody, receipts, and interface stay independent of any upstream project
- A product-advantage contract decided: plain-language drafting with mandatory review, one visible unit-of-work timeline (permissions/cost/result), step-through debugging with safe replay, local-first offline operation, predictable capped cost, a trusted credential vault, mandatory result-specific verification (not just "steps executed"), graduated examples, a connector SDK with an HTTP/OpenAPI fallback, subflow/search/trace escape hatches, and a signed/permissioned community catalog
- Seven pressure-test fixtures specified as acceptance gates (manual capture, branching approval, paginated subflow import, removable-device ingest, expired external credential, worst-case-bounded paid AI extraction, partial-completion order fulfillment), each with its own SOP, terminal verification, and challenge result

**Not built yet:**
- The 13-step build order: a portable workflow document schema → a deterministic local runtime with crash recovery → a constrained worker/connector sandbox → migrate the existing scheduler/spending controls → the visual builder and run timeline → SHELL-native triggers and actions → the connector SDK and first connectors → system-wide credential health → optional Tenari AI nodes → example workflows → a template/connector catalog → porting the lightweight Tenari experience → turning every fixture challenge into a deterministic test
- Research and acceptance gates: licence audits before adopting any upstream component, benchmark sessions across the competitor set, observed usability sessions, and closing every complaint claim with deterministic tests plus real user evidence
