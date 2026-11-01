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
