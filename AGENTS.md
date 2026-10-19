<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Office system health (not the personal /health room)
- Release health lives in `src/lib/office-health.ts` + Build & Testing `OfficeHealthPanel`: an update is "verified" only when every saved-data room in `POST_PUBLISH_ROOM_CHECKS` was opened signed-in on the current build fingerprint; connectivity, anonymous HTTP 200 and fixture renders never count. Why: a signed-out 200 hid the Brain crash.
- No background monitor exists (`HEALTH_SCHEDULE.configured = false`); do not present checks as continuous until a real owner-authorised scheduler exists. Why: signed-in checks need owner MFA.
- Populated room components are exported (e.g. `SavedFileList`) and covered by fixture-render tests. Why: empty-state tests missed the Brain tooltip crash.

## Database changes apply by merge — standard since 18 Oct 2026
- An approved migration in `supabase/migrations` goes live by merging to `main`. `.github/workflows/office-migrations-apply.yml` applies only files newer than the newest live change, skips held files (first line `-- Draft only` or a `-- canx:hold` line) and anything already recorded, and runs each file in one transaction with its history record. It uses its own secret `SUPABASE_DB_TOKEN` (database read/write only), separate from the functions token. Do not ask John to paste SQL into the Supabase dashboard, and do not rely on chat approval boxes. Mark a migration `-- canx:hold` if it must merge without going live. Rules and tests: `scripts/office-db/`. Why: the Supabase connector auto-cancelled the approved work-event migration three times.

## Supabase functions deploy by merge — standard since 15 Oct 2026
- `office-mcp`, `office-view` and `office-consent` ship only by merging to `main`; `.github/workflows/office-functions-deploy.yml` deploys changed bundles, keeps Verify JWT, and never touches secrets. Do not ask John to paste code into the Supabase dashboard. Details: `docs/office-functions-auto-deploy.md`.

## Detailed rules
- Shared operational status/log: read `docs/claude-access-stage1.md`. Append authorised evidence to `docs/office-shared-log.json`; preserve earlier entries and exclude credentials and private archive contents. Use the common status contract rather than treating configuration as verified live access. Stage 2–4 await John's separate approval.
- Subscriptions/billing, Office builders, Office Skills, room snapshots, Brain/project register and Google Drive rules: see `src/lib/AGENTS.md`.
- The office audit's checklist of record is `docs/office-audit.md`; keep it in step when room sources, skills or connections change. Why: no room may be silently dropped across staged work.

## GitHub saving and publication — standing authorisation, 4 October 2026
John explicitly requested automatic publication after every completed CanX Office application change (major or minor), pushed to GitHub as office changes are made. This supersedes older preview-only/no-publish instructions for completed, owner-requested CanX Office updates. It does not apply to Safe Highways or other projects.
- Finish every completed CanX Office change by running checks appropriate to the change, committing and pushing to the connected `canericaextreme/CanX-Office` branch, confirming Lovable has synced that commit, then publishing project `52572715-7d7c-4c7a-85cb-96664ada3394` to the existing `https://canx-office.lovable.app` address. Do not ask again for ordinary publication already authorised here.
- At the end of a work day, reconcile completed changes with GitHub and the published office. Publish completed updates that passed checks; leave incomplete or failed work staged and explain the exact blocker. An explicit later request to keep a change private overrides this default for that change.
- Preserve user records, secrets, budgets, authentication and rollback history. No force pushes, secret exposure, new spending, provider subscriptions, database migrations or unrelated changes are authorised by this release policy.
- Record the source commit and deployment result. A pending deployment is not a successful publication. Publishing and signed-in functional verification are separate: do not mark health or voice verified merely because publication succeeds.
- A ChatGPT evening release automation is a release check, not a continuous signed-in Office health monitor. Existing owner/MFA health requirements remain.

## Owner-only connection shutdown — 4 October 2026
Only John may turn off either Claude or ChatGPT/Codex once connected. Neither colleague may disable, revoke, remove, replace, or sever the other's Office access on its own initiative. Changes to either connection's enablement, credentials, routing, or removal require John's explicit instruction for that change; ordinary coding or standing publication authorisation does not authorise shutdown. Build candidates affecting these controls must remain proposals until that owner instruction is present. Do not claim the Office can disable the external ChatGPT or Claude account.

## Routine pull requests merge themselves — CanX merge robot (issue #142, 17 Oct 2026)
- For John-authorized routine work: open the PR into `main`, mark it ready and add the label `canx:auto-merge`. The robot merges after `pr-checks` and every other check pass and the other AI company approves the exact commit. Rules: `scripts/automerge/policy.mjs`; plain explanation: `docs/canx-merge-robot.md`.
- Do not label PRs that change money, legal, sign-in, permissions, secrets, workflows, database, or delete things; the robot sends those to John anyway. Merged is not live: still publish, verify and write the Brain note.
