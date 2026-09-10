# Forensic review: which checkpoint matches the morning screen

Review only. No code was changed, nothing was deployed, no paid call was made.

## A. Recommended target commit

**46822827550379ef81cdde87de252bf874def758 — "Added real activity logging", 9 Sep 2026 23:11 UTC.**

Evidence from the history:
- It is the last commit of yesterday. The next commit in the log is `a99807e3` at 10 Sep 16:51 ("Fixed stale Systems status"), the first change of today.
- The two other candidates are earlier the same evening and are supersets-in-progress of the same work: `9c5cd837` 22:16 ("Added Claude second-eyes review") and `ea721d0f` 23:07 ("Enabled Claude review flow").
- `11f4f5c7` is 9 Sep 21:53 — earlier than all three, which is why that rollback went too far back.

At `46822827` the Reception page contains exactly the desired elements: dark charcoal CANX Office heading, sample badge, Tour, the Office Manager information banner, the view that renders the 20-card grid, the Office status panel, and the Brain map panel (the coloured/green lower visual portion) below it.

## B. What removed the green section and caused the compression

Everything that touched Reception layout happened today, after `46822827`:

- `6f57e1a` / `38a1ba5` "Refactored Reception layout" and `ead7809` "Fixed Reception desktop layout" (17:40–18:10) moved the Brain map between the wide left column and the narrow 340px right strip. That narrow strip is what squeezes the activity text into one-word lines and leaves the wide left column mostly empty.
- `2621c88` "Fixed Brain responsive overflow", `ce5f778` "Fixed office toggle visibility", `ba83369` "Unified office view mode state", `68c249c` "Fixed startup view default bug" changed the view-mode state and defaults. The half-second flash of the correct grid followed by a compressed layout is this hydration/default-mode behaviour.
- `cff32c4` rolled back to the too-early `11f4f5c7`, and `8bc9658` ("Removed BrainMap from Reception") deleted the Brain panel from Reception — that is the direct cause of the missing green lower section right now.

The current tree differs from `46822827` in only 11 files: the Claude review files (deleted), Systems/round-table/inventory/doc edits, the Reception Brain removal, and a test file. Reception is otherwise byte-identical to the morning version.

## C. Effect on Supabase / auth / Finance / receipts

Restoring the whole commit is safe for data. Nothing under version control holds live data:
- The external CanX-owned Supabase project, its rows, and its users are outside git and untouched by a code restore.
- Secrets (`ANTHROPIC_API_KEY`, any Supabase keys, model names) live in Project Settings, not in the repo.
- SQL migrations under `docs/migrations/` are documents only; restoring them changes no database.
- Finance receipt review data stored device-locally in the browser is unaffected by a code restore.

One consequence to accept: `46822827` still contains the Claude Second Eyes code (added yesterday at `9c5cd837`/`ea721d0f`). Restoring the whole commit brings that code back, minus today's connectivity troubleshooting. Claude stays disconnected until a key and model are entered.

## D. Safest restoration procedure

Whole-checkpoint restore, no hybrid:

1. Restore every tracked file to its exact `46822827` content, including deleting files added after it (the `-index.test.ts` regression file) and re-adding files deleted since (the Claude review files).
2. Keep `.lovable/plan.md` as working metadata only.
3. Verify: typecheck, full test run, production build.
4. Browser check at 1920x1080 and 1366x768: Reception header, sample badge, Tour, Manager banner, the 20-card grid in four columns, Office status, and the Brain panel visible with its colour; no horizontal overflow; all 20 room routes load.
5. Report the result. Do not publish until the screen is confirmed correct.

If after restore the Brain panel still reads compressed in the 340px right strip, that is the original layout, not a regression — a separate, explicitly approved layout change would be needed.

## E. One open question

The morning screen opened directly in the 20-card "Simple view". At `46822827` the default is the office floor view, and Simple view is remembered from the browser's saved preference. Restoring this commit reproduces that behaviour exactly. If John wants Simple view to be the guaranteed default on every fresh load, that is a separate small change to approve after the restore.
