# Brain board foundations: three.js and the work-event record (19 Oct 2026)

John approved both protected changes on 18 Oct 2026 for the live Brain board. The builders cannot make them because they may only change `src/`, `public/`, `docs/` and `tests/`, so they ship as one separate change for John to approve.

## What this change adds
1. **three.js** (`three` 0.186.1, `@types/three` 0.186.0), pinned exactly and bundled with the app. No CDN. Both releases are older than the 24-hour supply-chain guard in `bunfig.toml`.
2. **`public.office_work_events`** (`supabase/migrations/20261019021500_office_work_events.sql`). This is the append-only record of work moving between rooms:
   - One row = one real change of room or stage for a task, project or Office build.
   - The stages are `brainstorming, strategizing, building, stalled, completed`, matching `src/lib/work-board.ts` (draft #171). "Stalled after 7 days with no event" is worked out when the record is read, not stored.
   - Rooms are the 24 Office routes (for example `/brain`, `/legal`).
   - Only John (owner role, no assistant token) can read or add rows. Nobody can edit or delete rows, including server code, because a trigger blocks update, delete and truncate.
   - The table is added to Supabase realtime so the board can update live. Row security still applies.

## Not done here
- **Applying the migration.** Merging does not run migrations (see `docs/office-view-install.md`), so applying it to the live database is a separate step that needs John's go-ahead.
- Recording events, the three.js Brain view, the Analytics charts and Elsie's board source. These are ordinary builder work once this change is merged and the table is live.
- Assistant (Elsie/Claude/ChatGPT) reading the table needs a separately approved reader.

## Checks run
The migration was run twice on a local Postgres 16 with Supabase-style stubs. Then 12 checks passed:
- John can add and read rows.
- Edits and deletes are refused, for John and for server code.
- Truncate is refused.
- An unknown stage, an unknown room, or a "change" that changes nothing is refused.
- Writing as another user is refused.
- An assistant token sees no rows and cannot add any.
- A non-owner sees no rows.
- The table is in the realtime publication.

three.js and its types compile together under strict TypeScript. The full frozen install, typecheck and tests run in `pr-checks`. They were not run locally, because the Lovable package cache refuses this session.
