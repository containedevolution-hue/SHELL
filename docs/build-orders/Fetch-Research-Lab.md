# Fetch Research Lab

Rebuilds Fetch around Labs, standardized research records, Lab Libraries, taxonomy indexing, Contractor extraction, and Calendar-owned seasonal presentation. Product contracts live in `Fetch.md`, `Contractors.md`, and `Calendar.md`; this file owns only the execution order.

**Built:**
- The Labs schema stood up and the former Fetch profile/research owner retired; deterministic tests cover account-scoped numbering and lifecycle, the standardized record and sealed taxonomy, Incognito publication, Ask-first/autonomy gates, research orchestration, full-page Library and Index views, and the day/night/Halloween surface

**Not built yet:**
- Connect controlled Contractor research: the research-terms input, serving provider, staged extraction with keep/correct review, Incognito exclusion, and idempotency
- Hand seasonal ownership to Calendar, replacing Fetch's built-in month check
- Prove the data layer against a real Postgres database (concurrent numbering, ownership, encryption, lifecycle idempotency, cascade/reference boundaries)
- Finish rendered acceptance in a real browser at desktop and phone widths across every state
