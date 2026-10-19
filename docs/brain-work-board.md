# Brain work board — draft status (19 October 2026)

Owner request: a real-data three.js board in the Brain room, with one node per room, sparks between rooms on each move, stage colours, live updates, an append-only work-event table, static Analytics charts and an Elsie-readable board source. Draft only, Claude builder, build cap $2.

## Done in this draft (code + fixture tests only)
- `src/lib/work-board.ts` (pure, no new dependency):
  - The five stages `brainstorming, strategizing, building, stalled, completed`, with colours.
  - Mapping: `planned` → strategizing, `blocked` → stalled. Unknown words come back as `null` and are not guessed.
  - Stall rule: work with no event for 7 days (`STALL_AFTER_MS`) shows as stalled. Completed work never stalls.
  - `isRecordableChange`: an event is due only when the room or the stage changes.
  - `parseWorkEvent` / `buildWorkBoard`: checks event rows against a strict format (bad rows are counted, not fixed), counts each duplicate id once, gives one node per room (empty rooms included), and makes one spark for each room-to-room move.
  - `stageTotals` (data for charts) and `workBoardForModel` (short text Elsie can read). With no event store, the board reports **NOT CONNECTED** and shows no activity.
- `src/lib/work-board.test.ts` covers all of the above.

## Not done: needs John's explicit approval (protected changes)
1. **`three` package**: adding a dependency is outside this builder's permissions. The 3D Brain view, its spark animation and the device testing it needs (WebGL on phone/tablet, frame rate, battery use) are not started.
2. **Append-only work-event table**: this needs a database migration with owner-only row security and no update/delete policy. Migrations are not authorised here.
3. **Recording events** when a task, project or Office build changes room or stage: this needs the table above. Project stage changes would also have to keep the project-register rule (separate label rows; import records never edited).
4. **Live updates** (realtime subscription): this needs the table.
5. **Brain room snapshot source + Elsie wiring**: wait until a real store exists, so Elsie is never given an empty board labelled as live. When wired, add it to the room snapshot contract and `docs/office-audit.md`.
6. **Static Analytics charts**: not added. Charts built on a missing table would show invented zeros. Add them once the table exists, using `stageTotals`.

Nothing was published, merged or deployed.
