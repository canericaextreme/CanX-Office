# Elsie's daily pre-trip

A quick morning walk-around of the Office, like a highway truck pre-trip. This is not Office Health: detailed diagnosis stays in Build & Testing.

## When it runs
- **Daily:** the first time John opens the Office on a new Office-local day (America/Dawson_Creek) **with two-step sign-in**. `DailyPreTripStarter` (in `src/routes/_office.tsx`) starts it beside Elsie, never inside her replies. The daily record id is fixed per day (`pretrip-YYYYMMDD-daily`), so a second tab or a reload can't make a duplicate.
- **Manual:** "Elsie, run your pre-trip again" (`run_pretrip` tool) or the **Run pre-trip again** button on the Owner's Desk. Each manual run is a new record (`pretrip-YYYYMMDD-manual-HHMMSS`). A repeat inside 2 minutes returns the run just made.

## What it checks (code: `src/lib/pretrip.server.ts`)
| Check | How | Never green when |
|---|---|---|
| ChatGPT / Claude (Office helpers) | One tiny paid message each (`pretrip-colleague.ts`), approved by John 24 Oct 2026. The reply must echo a one-time code and quote a real Work Board title. Uses the existing budget reservation. | No reply, wrong reply, key missing, budget refused |
| John's own ChatGPT / Claude apps | "Last seen" from `handoff-latest-*` notes. Elsie cannot message them. | Always unverified |
| 24 rooms | Existing read-only room snapshot (`readRoomSnapshotWith`), no pictures, no AI | A data source fails, is denied, or isn't read |
| Brain, Work Board, approvals, yesterday's memory | Owner-scoped reads | Read fails |
| Spending | `manager_budget_status` (paused = red, warning = yellow) | Read fails |
| Email | Reads the 6 a.m. sweep's own `email-sweep-receipt-YYYYMMDD` and ledger notes. It does not search Gmail. Delete candidates aren't counted (no delete rules exist). | No receipt for today |
| Background workers, backups | No record the Office can read | Always unverified |

Each check has 20 s, the whole run is capped at 60 s. A slow check becomes **unverified** and the run is marked **partial**. It never blocks Elsie.

## Card lifecycle
- Records are saved to `office_notes` (source `Elsie pre-trip`) and read back. They are never overwritten or deleted.
- "Today" is calculated, not stored, so at midnight the card shows **NOT CHECKED TODAY** without a timer, and red/yellow items from the last record show as still open.
- Each problem keeps its first-seen date (`since`), so an old problem is never reported as new. Two or more days → "look into it in Office Health".
- Viewer identities (assistant room pictures) don't see the card: the record includes AI budget figures, which are never shared with viewers.

## Elsie
Elsie gets one context line (`readPreTripForElsie`, 1.5 s cap, read in parallel) at the top of her continuity, in typed and voice paths. Her voice, personality and prompts are unchanged.

## Recovery
If the card breaks: Elsie and the Office keep working, because nothing depends on it. Revert the PR that added `src/lib/pretrip*.ts` and `PreTripCard.tsx`. Saved records stay in the Brain.

## Reporting repair — 24 October 2026 (local candidate)

Owner task: `a542ed30-2c98-4bfd-b3b0-062254ee8592`; supplied Brain reference:
`pretrip-20261024-manual-172922`. The reference contents were not available in
this checkout and production was not contacted. No saved Brain record or task
was modified.

- Room reports render once per saved ID; separate reports with identical titles remain separate.
- A new report keeps the full saved conversation summary with its saved timestamp.
  Older reports without this evidence explicitly say the summary is unavailable;
  a clipped dialogue is never reconstructed or presented as verified.
- Each non-green finding includes its name, status and saved reason (or an explicit
  reason-unavailable message). Room green means saved-data readability only.
- Reception's room-read panel timestamps failures, retains the last readable
  snapshot, labels it not fresh, and replaces it on recovery. Failed source
  details remain visible. Navigation/session changes still clear the panel.
- Elsie's pre-trip context identifies a run and asks for reporting it only when
  requested, once per run, rather than repeating it as a greeting. This is model
  guidance, not a guarantee of spoken deduplication. Voice, personality and audio
  configuration were not changed.

Regression variations cover duplicate IDs, identical titles, legacy/malformed
summary dates, complete long summaries, named yellow/unverified reasons, returned
and thrown refresh failures, first-read failure and recovery. Fixture tests do
not verify live saved records. Signed-in desktop/phone testing, narrow-screen
long-report readability, and audio/session acceptance remain necessary.

Local build receipt (2026-10-24T17:37:44Z): `npm run build` exited 0,
entry `index-dzKeOlFL.js`, SHA-256
`108ee89886dd8d7ad49b996cea112654e0112fc3bd1e9f0c6519c7976bc151aa`.
Base HEAD `dc4b85a39e2381c7fab931616aa7402281be88df`, with local uncommitted
repair changes. `npm run typecheck` exited 0; focused Vitest run: 6 files,
55 tests passed. Existing server-function deprecation/build warnings remain.
This is a local build receipt, not a builder-job, deployed-release or live-health
receipt. The fix is logged in `docs/office-shared-log.json`; no Brain write occurred.
