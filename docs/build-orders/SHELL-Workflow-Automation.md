# SHELL Workflow Automation

Build Automations as SHELL's local-first workflow system and expose a lighter host-compatible experience through Tenari. Product behavior is owned by `Apps/apps/automations/README.md`; SHELL authority and portability are owned by `Shell/README.md`. This order owns only the cross-system execution sequence.

## Foundation decision

- Use n8n as a product and interaction benchmark, not an embedded dependency. Its Sustainable Use License is source-available rather than OSI open source and does not permit the intended customer-facing commercial embedding without a separate agreement.
- Evaluate Activepieces core first for selective reuse because its documented core licence is MIT. Inventory every file and dependency before import; enterprise directories and features remain excluded.
- Evaluate Node-RED for Apache-2.0 runtime, graph, message-passing, device, and community-node patterns. Prefer adapting small proven components over importing its editor or runtime wholesale.
- Treat Automatisch and source-built Windmill as architectural references only unless an explicit AGPL distribution decision is made. Do not mix their code into SHELL by accident through copied snippets, generated output, packages, images, or bundled services.
- Keep SHELL's workflow schema, capability grants, credential custody, execution receipts, and interface independent of every upstream project so an integration can be replaced without breaking user workflows.

## Product advantages

Recurring review themes across n8n, Zapier, Make, Pipedream, and Activepieces are a steep learning curve for advanced flows, weak debugging and error recovery, confusing navigation as graphs grow, missing or incomplete integrations, unexpected usage pricing, brittle authentication, and uneven support. SHELL answers them at the contract level:

- **Start in plain language, remain inspectable.** The user describes the outcome; the Companion proposes a small graph, explains every step, highlights assumptions, and never activates it without review. Manual graph editing remains first-class.
- **One visible unit of work.** Before activation and after every run, show trigger, inputs, outputs, permissions, external calls, local work, AI use, estimated cost, actual cost, and terminal result in one timeline.
- **Debug without rebuilding.** Step-through test mode, typed fixtures, breakpoints, input/output inspection, safe replay from a selected step, revision diff, and actionable errors replace opaque failure messages.
- **Local-first and useful offline.** Schedules, file/device events, deterministic transforms, queues, logs, and local-model nodes work without a cloud account. Cloud reach is explicit per connector and run.
- **Predictable cost.** Local deterministic work has no per-task fee. External provider charges and Stardust are estimated separately, capped before execution, settled from actual use, and never silently increase.
- **Credentials users can trust.** Accounts are connected once to the local vault, scoped to named actions, health-checked before activation, redacted everywhere, easy to revoke, and paused with a repair path when authentication expires.
- **Success requires proof.** Every workflow carries a readable SOP and ends with a result-specific verification. A run that executed its steps but could not prove its intended outcome remains visibly unverified.
- **Learn by level.** Beginner, intermediate, and advanced examples expose the graph, directions, evidence, likely failures, and recovery path without forcing a new user to reverse-engineer a template.
- **No connector dead end.** Ship high-quality native connectors, a permissioned HTTP/OpenAPI connector, webhooks, local command adapters with narrow grants, and a documented connector SDK. Unsupported actions degrade to a guided API step rather than forcing platform migration.
- **Complexity has escape hatches.** Collapse branches into named subflows, search the canvas, trace one datum through the graph, zoom to the failing path, and provide visual mode plus code mode over the same portable schema.
- **Safe community ecosystem.** Signed packages, declared capabilities, dependency and licence manifests, publisher identity, version pinning, update previews, vulnerability revocation, and per-connector isolation are prerequisites for a public catalog.

## Contract pressure-test corpus

The portable document and runtime must express these cases without connector-specific hidden state or permissive defaults. Each fixture begins with its SOP and terminal verification; its challenge result is the contract the build must preserve.

### 1. Beginner two-step — manual capture to Notes

**SOP.** Given one text value and an approved Notes destination, a manual trigger validates the non-empty text, creates one note with the run's stable effect key, and exposes the input, permission, expected local effect, and free cost before Run.

**Terminal verification.** Read the destination through the Notes capability after the write and prove exactly one note has the effect key, expected text hash, destination identity, and a modification time after the run began.

**Challenge result.** Reject a missing or changed destination grant before writing. Double-click, crash, and replay converge on one note. Stop before dispatch yields no note; stop after the atomic write yields a visible completed effect and still runs verification. Cached list state cannot prove success. This fixture works offline and has no credential or spending state.

### 2. Intermediate branch — invoice review

**SOP.** Given one typed invoice fixture, validate its identity and amount; archive it automatically below the configured threshold, or request human approval at or above the threshold and archive only after approval. Notify locally after the chosen archive effect is proven.

**Terminal verification.** Query the archive by invoice identity and content hash, prove exactly one destination record is newer than the trigger, prove the unchosen branch produced no effect, and prove the local notification refers to that verified record.

**Challenge result.** Branch choice and threshold belong to the immutable run snapshot. Missing, malformed, or changed amount fails before either branch. Approval expiry, rejection, offline wait, and stop leave no archive effect; stop after archive reports partial effects rather than undo. Retries reuse one archive key and never repeat the notification. Verification reads both positive and forbidden state so an old matching record cannot create false success.

### 3. Advanced reusable subflow — bounded paginated import

**SOP.** Fetch at most ten pages or 1,000 records, whichever comes first; invoke a version-pinned Normalize-and-Deduplicate subflow for each page; collect typed accepted/rejected results; then upsert accepted records into the approved destination. The parent shows the expanded permissions, retry count, concurrency, and limits of the pinned subflow before activation.

**Terminal verification.** Read the destination and prove the run manifest's source identities, normalized hashes, accepted count, rejected count, and duplicate count reconcile exactly, with no destination row outside the manifest changed by the run.

**Challenge result.** A subflow cannot add reach, credentials, cost, loops, or retries beyond the parent's admitted expansion. Pagination tokens are durable but expire with the input snapshot; a changed subflow revision starts a new run rather than mutating recovery. Duplicate pages, crash/restart, and replay converge through source-scoped effect keys. Rate limits back off inside the deadline; exceeding a bound stops visibly instead of truncating into success. Stop prevents new pages and writes, while committed upserts remain itemized for resumable verification.

### 4. Local file and device — removable-media ingest

**SOP.** When an approved removable device appears, read only a granted source folder, copy stable files into a separately granted local destination using a temporary name, verify bytes, atomically publish, and add a local index entry. Source deletion is not part of this workflow.

**Terminal verification.** Re-read the published destination file and index through their capabilities; prove source-relative identity, byte count, content hash, final path containment, one index entry, and timestamps after detection. Also prove the source file still exists when the device remains present.

**Challenge result.** Device presence is not a grant; read and write roots remain separate and real-path containment rejects junction escape. An offline SHELL Cloud or Tenari account is irrelevant. Device removal during copy leaves only a named recoverable temporary artifact, never a published success. Duplicate events converge on the content/effect key. Stop is honored before open, between chunks, before publish, and before index; after publish it reports the file as a partial effect and verification determines recovery. No arbitrary process or network reach is inherited.

### 5. External account — expired calendar credential

**SOP.** For a scheduled approved input, require a calendar credential scoped to event creation, check provider-declared expiry or the provider's smallest safe health operation, create one event with a stable provider-supported effect key, then read it back. If authentication is confirmed expired or invalid, pause before transport and offer reconnect; after verified repair, resume the same logical run only while its input is still fresh.

**Terminal verification.** Provider-read the event by effect key and prove calendar, subject hash, start/end, and provider modification time match this run. On the expired path, prove no request capable of creating an event was sent and emit one deduplicated actionable health fault naming affected workflows and the last safe check.

**Challenge result.** Credential values never enter the document, log, evidence, export, or model input. A cached healthy observation cannot override declared expiry or an authentication failure. Offline/unknown is not invalid and does not turn the Top Bar red, but it cannot authorize a call requiring a fresh check. Reconnect creates a new credential revision and explicit resume admission; it does not mutate an in-flight grant. Timeout after transport yields `Unverified` until provider lookup resolves the effect, never blind retry. Stop before transport has no effect; stop after acceptance records the event even if local cancellation won the race.

### 6. Paid AI — worst-case bounded document extraction

**SOP.** Accept at most 20 approved documents. For each, run one paid classification call and, on the most expensive reachable branch, one paid extraction plus one paid verification call; permit at most one retry per call. Preview excluded private fields, model destination, provider-account charges, Stardust charges, per-run maximum, period remaining, and the exact bound before approval.

**Terminal verification.** For every admitted document, prove an output is linked to its input hash and schema revision, and that required paid verification passed with evidence newer than generation. Reconcile provider receipts, Stardust authorization, actual settlement, and released remainder exactly once; semantic uncertainty remains `Unverified` rather than being converted to success by transport completion.

**Challenge result.** Admission prices the worst path as `20 × 2 attempts × (classification + extraction + verification maxima)`, plus every separately priced action; mutually exclusive branches may share a maximum only when the graph proves exclusivity. Concurrent runs reserve atomically against both per-run and period ceilings. Unknown pricing, unbounded model output, dynamic fan-out, or a subflow whose maximum cannot be expanded is refused. A cheaper actual path settles only actual cost. Stop prevents new paid calls, cannot cancel a provider charge already accepted, and releases unused authorization once. BYOK cost and Stardust remain separate caps and neither silently falls back to the other.

### 7. Partial completion, stop, restart, and recovery — order fulfilment

**SOP.** On one authenticated order webhook, validate and persist the input; reserve inventory; buy one shipping label; wait for both effects to be verified; then send one notification. Declare inventory compensation, label non-refundability, effect keys, timeouts, replay approvals, and delivery semantics before activation.

**Terminal verification.** Query inventory and carrier by their stable keys, prove the intended quantity is reserved once and exactly one valid label exists, then prove one notification references those verified effects. Reconcile every effect receipt and cost settlement to the run before `Succeeded`.

**Challenge result.** Exercise stop before and after every durable boundary, process death during every dispatch, duplicate webhook delivery, reboot, stale provider evidence, and restart. Recovery inspects receipts and destination state before dispatching anything. A timeout after a non-idempotent carrier request becomes `Stop pending — external outcome unknown` or `Unverified`; it never auto-retries until lookup proves absence or the user approves the duplicate risk. Compensation is a new visible effect and can fail; it never erases the original receipt. Notification stays blocked until both upstream outcomes are known. Force stop proves worker/resource release but does not claim inventory release, label refund, or remote cancellation.

These fixtures close the pre-implementation pressure test only at the product-contract level. They become executable gates as the document schema and runtime land; observed provider, device, cost, and usability evidence remains acceptance work rather than being inferred from this specification.

## Build order

1. **Specify the portable workflow document against the seven fixtures.** Version triggers, typed ports, nodes, edges, conditions, bounded loops, delays, approvals, pinned subflows, retries, effect keys and delivery semantics, time zones, input/grant/credential snapshots, evidence freshness, missed-run policy, required capabilities, credential references, separate cost policies, SOP, terminal verification, stop states, and migration behavior. Use stable SHELL operation identifiers rather than vendor node names. Reject the schema if any fixture needs an implicit runtime default.
2. **Build the deterministic local runtime.** Execute DAG steps through a durable local queue with cancellation, timeouts, backoff, concurrency limits, crash recovery, explicit at-most-once or at-least-once action semantics, destination reconciliation before replay, and exactly-once authorization and settlement boundaries.
3. **Build the constrained worker boundary.** Isolate custom code and connectors from the desktop process; deny filesystem, network, process, device, secret, and model access unless the node manifest and admitted local grant revision allow it. Redact secrets before persistence and diagnostics.
4. **Unify existing scheduler and spending controls.** Migrate current automation definitions and runs into the workflow schema without weakening stop, missed-run, worst-reachable-cost authorization, period ceiling, set-aside, receipt, or insufficient-funds behavior.
5. **Ship the visual builder and run timeline.** Add searchable nodes, graph validation, plain-language directions, immutable run inputs, permission and cost preview, test fixtures, per-step inspection, breakpoints, revision history, effect-aware replay, fresh terminal verification, and graph navigation that remains usable for large workflows.
6. **Ship SHELL-native triggers and actions.** Start with schedule, manual run, webhook, file change, app event, notification, Files, FETCH, Notes/Scribble, and explicit human approval. Every operation goes through the versioned SHELL capability interface.
7. **Build the connector SDK and first external connectors.** Use typed schemas, OAuth or API-key vault references, declared or observed expiry, connection health with source and freshness, rate-limit metadata, pagination, effect lookup/idempotency support, webhook lifecycle, test fixtures, and deterministic contract tests. Include generic HTTP/OpenAPI paths so missing native coverage is not a blocker.
8. **Add system-wide credential health.** Verify connections at safe provider-specific intervals and when a run encounters authentication failure; distinguish expired, invalid, unknown/offline, stale, and healthy states. Pause affected work and feed one deduplicated actionable red signal to the Top Bar only when repairable invalidity is confirmed, then clear it only after verified repair.
9. **Add Tenari intelligence deliberately.** Natural-language graph drafting, workflow explanation, mapping suggestions, extraction, classification, generation, and local/hosted model choice are optional nodes. Model input is previewable, private fields can be excluded, and every paid execution remains bounded by Automations.
10. **Create examples and approved support patterns.** Publish the seven graduated workflows with executable test evidence and promote only verified repairs into Helix's signed knowledge set. Local AI may guide the user through those records but cannot treat community discussion as approved instructions.
11. **Create a safe template and connector catalog.** Require licence provenance, permissions, data destinations, maintainer, version, signatures, security status, and reproducible tests. Installation never activates a workflow or grants credentials automatically.
12. **Port the lightweight Tenari experience.** Share the workflow document and compatible UI where practical; map execution to host capabilities on Windows, macOS, Linux, Android, and Apple platforms. Unsupported native triggers are stated plainly and do not pretend to run.
13. **Prove recovery and trust.** Turn every challenge in the seven fixtures into deterministic tests, then exercise offline schedules, reboot recovery, duplicate delivery, mid-run stop, expired credentials, revoked grants, rate limits, malformed connector output, connector compromise, missing funds, provider outage, schema upgrade/rollback, export/import, terminal verification, and complete secret redaction.

## Research and acceptance gates

- Before choosing any upstream component, record its exact commit, file-level licence, transitive dependency licences, notices, modification boundary, and whether SHELL distributes source, binaries, or a hosted service. Legal counsel decides uncertain commercial or copyleft use.
- Benchmark representative workflows in n8n, Activepieces, Node-RED, Make, Zapier, and Pipedream: simple two-step sync, branched approval, paginated import, webhook with retry, local file/device event, mixed local/cloud workflow, and AI-assisted extraction.
- Conduct observed usability sessions with first-time and advanced users. Measure time to first successful run, permission comprehension, recovery from a seeded failure, ability to predict cost, and success locating the exact step that transformed or exposed data.
- Treat every fixture SOP and verification as an acceptance input, not explanatory documentation. Tests must challenge false positives, false negatives, partial completion, duplicate effects, stale credentials, stale evidence, cost-bound expansion, and a user stopping at every durable boundary.
- Do not claim complaint reduction from design intent. Close each advantage only with deterministic runtime tests plus observed user evidence for learning, navigation, debugging, credential repair, and cost comprehension.

## Close when

- SHELL can create, explain, authorize, execute, stop, inspect, repair, export, import, and migrate useful workflows locally without Tenari or a cloud account.
- Tenari can propose and operate only the subset supported by its host, with unsupported capability gaps visible before activation.
- No workflow, connector, template, or model can widen permissions, expose a secret, spend beyond approval, or gain unrestricted machine authority.
- The shipped dependency tree is licence-audited and contains no restricted code used outside its terms.
- Real users can build and recover representative workflows, understand their data reach and cost, and identify a failing step without developer intervention.

Then delete this order. Git retains the research and execution history.
