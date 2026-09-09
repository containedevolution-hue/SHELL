# Dev Mainframe

The master account's admin-only developer control room for operational tools and read-only views of how Tenari runs.

**Built:**
- An admin-only entry gate from the Apps/Settings Dev bands, with every route behind it requiring admin
- Six tiles built: Test Control Room (a Boards-style test catalog with classification/review history and duplicate/overlap analysis), LLM Calls (an OpenRouter activity mirror: model, tokens, billed cost), Worker Bots (an auto-generated cron desk view polling `cron_runs`, each with a manual Run-now button), Boot Folder (a read-only Companion prompt-layer viewer), Re-sort filed memories (bulk re-file via the Orion admin route), and Users/roster (invite grant/revoke)

**Not built yet:**
- Review the current relationship queue (exact-title duplicates first, then partial overlaps)
- Confirm every route actually requires `admin` middleware, not just login
- Confirm the Worker Bots floor truly regenerates from the live cron registry with no page edit needed
