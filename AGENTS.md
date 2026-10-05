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
- Release health (`src/lib/office-health.ts`, Build & Testing `OfficeHealthPanel`) is "verified" only when every room in `POST_PUBLISH_ROOM_CHECKS` was opened signed-in on the current build; connectivity, anonymous 200s and fixture renders never count. Why: a signed-out 200 hid the Brain crash.
- No background monitor exists (`HEALTH_SCHEDULE.configured = false`); never present checks as continuous. Why: signed-in checks need owner MFA.
- Populated room components are exported and covered by fixture-render tests. Why: empty-state tests missed the Brain tooltip crash.

## Library rules
- Finance/Gmail/receipts, skills, room snapshots, Brain index, project register and builder routing: see `src/lib/AGENTS.md`. Keep `docs/office-audit.md` in step with room sources, skills and connections.

## Release policy (CanX Office only, standing authorisation 4 Oct 2026)
- After each completed owner-requested change: run fitting checks, push to `canericaextreme/CanX-Office`, confirm Lovable sync, publish to https://canx-office.lovable.app without re-asking. A later request to keep a change private overrides this. Not for Safe Highways or other projects.
- End of day: reconcile GitHub and published office; leave failed/incomplete work unpublished with the exact blocker.
- Never authorised by this policy: force pushes, secret exposure, spending, subscriptions, migrations, unrelated changes. Preserve records, budgets, auth and history.
- Record commit and deployment result; pending deploy is not success; publication never equals signed-in verification. ChatGPT evening automation is a release check, not a health monitor.

## Owner-only connection shutdown (4 Oct 2026)
- Only John may disable, revoke, reroute or replace Claude or ChatGPT/Codex access; neither colleague may do so, and coding/publication authority does not cover it. Changes to these controls stay proposals until John explicitly instructs. Never claim the Office can disable external accounts.
