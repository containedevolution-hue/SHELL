# Fetch

FETCH is SHELL's browser and evidence-first research system. Ordinary web browsing and Research Labs are two modes over one permission, history, source, download, and evidence boundary. FETCH works without Tenari; a connected Companion uses it only through granted SHELL capabilities.

## Ownership

- FETCH owns browser tabs, navigation, profiles, history, bookmarks, downloads, site permissions, engine updates, and the boundary between untrusted web content and SHELL capabilities.
- The browser interface is SHELL-owned. Its first engine may embed Chromium rather than requiring Chrome to be installed; alternate engines remain possible behind the same browser contract.
- Fetch owns Labs, research templates, Lab Libraries, findings, evidence, summaries, sources, taxonomy, the account-wide Index, research preferences, and the raw-research deletion lifecycle.
- A Lab is one research assignment and one continuous conversation. It has a permanent account-scoped sequential identifier such as `Lab 002`; identifiers are never reused, and a title may be renamed without changing the identifier.
- Lab numbers are allocated transactionally per account, not derived from a global database sequence or a list position. More than one Lab may remain active; active is a lifecycle state, not an exclusive current-Lab lock.
- Every raw research body is sealed to the account key. Index taxonomy and the minimum fields needed to locate a surviving standardized research record remain searchable without exposing the raw conversation.
- FETCH research is available to FETCH and permissioned Contractor work without becoming canonical User Memory or a second Companion identity. Tenari is optional and does not own Labs.
- External claims remain sourced evidence. They never become direct-user evidence merely because Fetch or a Contractor retained them.

## Lab contract

- Starting a new chat starts a new Lab. One Lab may move through the entire laboratory while retaining one conversation, identifier, Library, and research record.
- A Lab may be created **Incognito**. Its sealed record and taxonomy remain available only inside that Lab and its Library; they never enter the account-wide Index, cross-Lab recall, Contractor matching, or extraction. Incognito survives archive and raw-workspace deletion. A deliberate confirmed Publish to Index permanently converts it into an ordinary indexed Lab.
- The starting categories are **Explore**, **Live Research**, **Fact-check**, **Compare**, **Deep Dive**, and **Fun**. The data model supports later user-created categories with attached tools.
- Explore includes an **I'm not sure yet** entry that narrows an uncertain idea before research begins.
- A persistent header names the active category and describes its available capability. Every category transition is recorded, and each finding retains the category that produced it.
- Each category owns a changeable stored template. Fetch updates the Lab's standardized template as decisions, findings, evidence, tables, comparisons, artifacts, and open questions develop, like a living build order rather than a transcript dump.
- The bottom of every template holds the Lab taxonomy: all referenced subjects, entities, categories, and keywords. Taxonomy changes immediately update the account-wide Index.
- Taxonomy terms have a canonical normalized identity, display label, related forms, provenance, and user correction. Sensitive labels stay sealed; exact matching uses an account-keyed fingerprint rather than plaintext global tags.
- Fetch may proceed when it has enough information unless the account's Lab-autonomy setting requires direct permission before it chooses or proceeds.
- An active Lab fuels and edits its template. Closing a Lab archives it as inactive; an archived Lab may be unarchived and resumed with the same identifier and record.
- Deleting a Lab removes its raw conversation, working data, and Lab Library. Its standardized research record, taxonomy, evidence provenance, and Index presence survive as a dead Lab record so prior research remains findable. The Index distinguishes active, archived, and deleted-source Lab identifiers.

## Library and Index

- Every live or archived Lab has one dedicated Library book, initially labeled with its Lab identifier and renameable afterward.
- A Lab Library holds that assignment's living summary, findings and claims, evidence and sources, tables and comparisons, generated research artifacts, open questions, taxonomy, and category history. The raw conversation belongs to the Lab workspace rather than the Library.
- The standardized research record is the one canonical stored structure. The Lab template, Library, and Index are editable or filtered views of that record, never three copies that can drift.
- The Index is the simple full-page account-wide search surface over standardized research records and taxonomy. Sources are Index filters, not a third top-level destination.
- Searching a taxonomy term shows every related Lab identifier, for example `robotics — 002, 007, 062`. Selecting a live or archived identifier opens its Lab details; selecting a dead identifier opens only the surviving standardized record.
- The Index continuously mirrors Lab templates. There is no manual Save, per-Lab indexing switch, or unsaved research state.
- Deletion freezes the last standardized record and removes raw messages, fetched page bodies, working snippets, and private scratch state. The surviving record keeps only its structured synthesis, citations, source metadata, taxonomy, and evidence assessment.

## Live research and permissions

- Fetch settings own live-search behavior: **Off** uses the Index and internal Lab knowledge only; **Automatic** permits Fetch to connect to Serper when the active work needs current outside evidence; **Ask first** requires approval before each new live-research pass.
- Off blocks every new outside-network read, including Serper, direct source reads, and source refresh. One Ask-first approval covers the displayed query, its immediate results, reading selected public sources from that result set, and the displayed spending ceiling. It is single-use and bound to the account, Lab, query, category/action, request identity, and ceiling; a materially changed query, new pass, expired grant, or higher ceiling requires new approval. No cost reservation occurs before approval.
- Fetch settings separately let the user allow Fetch to proceed when ready or require direct permission before Fetch chooses a category or advances the research template.
- Substantive live research distinguishes provider failure from a successful search with no results. Source reads enforce address, redirect, and size boundaries; snippet-only evidence is labeled and cannot establish a durable finding by itself.
- Findings distinguish supported, disputed, and unsupported claims and preserve provenance. Metered work reserves through the shared cost gate and never pretends failed research completed.
- Later category tool bindings select only from an owned allowlisted capability catalog. A category cannot grant tool permission, bypass the tool's consent boundary, or store arbitrary executable instructions.

## Contractor bridge

- Each Contractor book registers a controlled research vocabulary from Fetch taxonomy terms and user-created related terms. Fetch owns normalization and matching against the taxonomy at the bottom of every standardized Lab template.
- Whenever a Lab taxonomy changes, Fetch refreshes its Contractor matches. Matching terms automatically reference the Lab identifier from each eligible book without copying the Lab or promoting its claims to kept knowledge.
- Automatic references are a live candidate feed, never durable book entries or Companion context.
- A user may send a bounded template category or selected portion of a Lab to a Contractor by Lab identifier. The Contractor extracts only material relevant to that book's job and keeps the evidence provenance.
- Contractor entries retain a navigable Lab reference while the source Lab is live or archived. Deleting the Lab removes the navigable reference but does not delete the Contractor's extracted information or its evidence.
- Contractor review and keep/correct rules remain owned by `Contractors.md`.

## Surface

- The Home tile remains **Fetch**. The opened app header says **Fetch Research Lab** and retains the Fetch icon.
- The landing surface borrows Home's inline category behavior: selecting a research category opens its workspace below. It also exposes recent Labs and the **I'm not sure yet** start.
- The professional Lab environment follows Home's day/night sky so extended work communicates the time of day, while keeping denser research-oriented components rather than copying Home wholesale.
- Fetch alone carries a subtle cultural seasonal treatment. A seasonal color line and one small decorative composition sit on Fetch's contribution to the adaptive Status Bar and on the outer Lab frame; Halloween uses an orange line with a jack-o'-lantern and black cat, without glow or animation.
- The seasonal schedule follows broad North American cultural visibility in the account timezone; Halloween begins around September 1 and ends October 31. Calendar eventually owns the schedule, but these dates never become personal events and Fetch exposes no seasonal preference switch.

## Next Builds

The cross-owner execution order lives in `memory/ledger/build-orders/Fetch-Research-Lab.md`.

## Limits

- External content remains untrusted input.
- Fetch is a factual system, not a character or second Companion.
- Research and tool results do not silently become Companion relationship memory or canonical User Memory.
