# Fetch

FETCH is SHELL's browser and evidence-first research system — ordinary browsing and Research Labs share one permission, history, and evidence boundary. Works without Tenari.

**Built:**
- Ownership decided: FETCH owns tabs/navigation/profiles/history/downloads/permissions/engine updates plus Labs/templates/Libraries/findings/evidence/taxonomy/Index/research-preferences; Apps Chat stays the general conversation surface
- A Lab model designed: a permanent per-account sequential Lab id, transactional numbering, an Incognito mode sealed from the Index/Contractor matching until an explicit Publish, six starting categories (Explore/Live Research/Fact-check/Compare/Deep Dive/Fun) each with a living standardized template, and a taxonomy block that drives the account-wide Index
- A Library/Index model designed: one canonical standardized research record per Lab, with the Lab template/Library/Index as views over it (never three drifting copies); deletion freezes the record, strips raw inputs, and keeps a dead-but-findable entry
- A live-research permission model decided: Off/Automatic/Ask-first settings, single-use scoped approval grants, snippet-only evidence explicitly labeled, cost reservation only after approval
- A Contractor bridge designed: taxonomy-term matching refreshed on every Lab taxonomy change, references as a live candidate feed only (never durable book entries), bounded manual extraction that survives Lab deletion
- The surface decided: Home tile "Fetch," opened header "Fetch Research Lab," Home's day/night sky reused, a subtle seasonal decoration (e.g. Halloween) on the Status Bar contribution and Lab frame, with the schedule eventually owned by Calendar

**Not built yet:**
- A complete FETCH browser/Lab runtime and the Chat-to-Lab handoff contract (see `Fetch-Research-Lab.md` for the execution order)
- Everything routed through that build order: the controlled Contractor connection, Calendar-owned seasonal schedule, Postgres-backed proof, and full rendered browser acceptance
