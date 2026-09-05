# Dev Mainframe

The master account's developer control room for operational tools and read-only views of how Tenari
runs.

## Features

- Admin-only entry from the Apps and Settings Dev bands. Every route behind it requires admin, not
  just a login.
- Six tiles: Test Control Room, LLM Calls (OpenRouter), Worker Bots, Boot Folder, Re-sort filed
  memories, and Users (roster).
- Test Control Room is the admin-only Boards-style view of the executable test catalog. Active tests
  are grouped by product family and owning area and labeled
  with both their execution layer and honest proof strength. CI refreshes automatic classifications
  without overwriting a manually locked classification. The current disposition, risk, and diagnosis
  remain visible per current test identity, while every review change records its reviewer, time,
  previous values, new values, and reason. Removed tests are deleted unless an admin explicitly marks
  one as a regression guard and records the behavior that must not return. Within each family and
  owning area, a bounded deterministic analyzer flags probable duplicates, partial overlaps, possible
  conflicts, and complementary coverage for review; it never deletes or resolves tests automatically.
  Current repeated failures aggregate by normalized failure signature.
- LLM Calls is the in-app mirror of the OpenRouter activity log — model used, tokens, and real billed
  cost per call.
- Worker Bots draws one desk per scheduled cron, generated from the server's own registry rather than
  a hand-written map, so a new cron appears on the floor with no page edit. Status is read from
  `cron_runs` on a five-second poll and each bot walks to the app it touches. Under the floor, every
  bot has a Run now button that fires the same job the scheduler fires; a cron with no registered
  runner, or one whose registry entry disables manual firing, shows the button disabled and says so.
- Boot Folder is a read-only view of the Companion prompt layers, mode preambles, and compiled user
  base.
- Re-sort filed memories re-files every memory on the account under the current librarian, backed by
  the Orion admin refile route.
- Users (roster) is the tester-access page that grants and revokes invites.

## One line warnings

- The Dev Mainframe is master-account only; future diagnostics must not expose internal role fragments as user-facing personas.

## Next Builds

1. Review the current relationship queue before broad category cleanup, beginning with the exact-title
   probable duplicate and then the partial overlaps.
2. Confirm every route behind it requires `admin`, not just login (add a middleware test if absent).
3. Confirm Worker Bots floor is generated from the live cron registry (a new cron appears with no page edit).
