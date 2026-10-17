# Analytics Control Room — release and rollback

Continues ChatGPT's draft PR #126 (branch `chatgpt/analytics-overview-20261016`). Finished by Claude on 17 Oct 2026.

## What the release changes
- `/analytics` shows ten clickable cards on one desktop screen (health, money, AI usage, builders, assignment sources, projects, time, bottlenecks, top three actions, security and recovery) with drilldowns and three small charts.
- One new read-only source on the shared room snapshot (`analytics`, in `src/lib/room-snapshot*.ts`). The room and Elsie read the same snapshot, so Elsie explains exactly what John sees. `src/lib/analytics-overview.ts` builds the cards; `src/lib/analytics-overview.server.ts` reads the records.
- Readings come from: Work Board tasks, approvals, change log, the AI budget meter (`manager_budget_status`), the AI call log, Finance receipts and subscriptions (two-step only), the project register (two-step only) and the GitHub run lists of the two Office builder workflows (read with the existing Office server GitHub credential).
- Anything not read says "Could not be read", "Not connected", "Not measured", "Needs two-step sign-in", "Not shared with this viewer" or "Awaiting verification". Policy limits (C$500 ceiling, C$100 Manager AI, US$2 Claude build cap) are labelled "Policy limit", never spending.
- "Ask Elsie" buttons put an unsent draft in Elsie's panel (source label "A room button you pressed"). Nothing is sent or spent until John presses Send or says it.

## What it does not change
No database migration, no write path, no change to authentication, viewer grants, budgets, builder settings, voice settings, Finance, Safe Highways or the skills registry. No new service or subscription.

## Stable version before release (rollback point)
- `main` at `683c71661d1eec21b19462f83c091ce5ae7cc762` (merge of PR #125).
- Live bundle `index-XMBbfKCf.js`, seen on `/analytics` by a room picture at 2026-10-17 00:24:59 UTC.

## Rollback
1. On GitHub, revert the Analytics merge commit on `main` (`git revert -m 1 <merge sha>`, or the PR's Revert button), and merge that revert. History is kept; nothing is force-pushed.
2. Confirm Lovable synced the revert commit, then publish project `52572715-7d7c-4c7a-85cb-96664ada3394` again.
3. Check a fresh `/analytics` picture shows the old room and a new bundle name.
Because the release adds no migration and writes no data, rolling back loses nothing and needs no database step. Lovable's own version history is a second way back.

## Verification after publish
- The live bundle name changes from `index-XMBbfKCf.js`.
- A fresh `/analytics` picture shows the ten cards. The picture is taken by the read-only viewer, so the AI meter and call log always show "Not shared with this viewer", and any source whose room John has not shared with that viewer shows the same label. Viewer row security hides rows rather than refusing them, so the reader checks the viewer's shared rooms first and never turns hidden rows into zeros.
- Signed in with two-step, John sees money and project numbers; Elsie, asked in the room, explains a card from the same readings.
