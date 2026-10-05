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

## Subscriptions and billing evidence
- Finance/Gmail/receipt rules: see `src/lib/AGENTS.md`.

## Office Skills
- Canonical skill instructions and the registry live in `src/lib/office-skills.ts` (versioned, with provenance from John's skills map); never fetched from a ChatGPT Skill Library at runtime. Why: Elsie must stay independent of ChatGPT and Lovable.
- Typed Elsie chat appends deterministic request-aware skill output (router + owner-decision filter always, at most 3 matching installed task skills) to the system instructions; broad room reviews disclose procedures omitted by the cap, and skills grant no tools. Live voice sessions embed only the always-on core skills (`voiceSessionSkillGuidance`, fixed at session mint); task skills reach voice per turn via submit_office_request → the same room-aware path. Why: bounded context and no new tools or permissions.
- Every named master-map job and actual-room skill is installed (instructionReady); reserved/legacy entries stay inert. Explicit room-wide checks (`subscriptions-skill-audit.ts`, whole-office `office-audit.ts`) enumerate outside the three-task prompt cap with per-room/per-skill evidence and exact next tasks; neither ever changes `liveTested`. Why: John authorised whole-office wiring, but installed instructions must never imply connected tools or owner verification.
- The office audit's checklist of record is `docs/office-audit.md`; keep it in step when room sources, skills or connections change. Why: no room may be silently dropped across staged work.
- Rooms only link to skills (`RoomSkillsLink`); editable instructions exist only on /skills, reached from Family Continuity & Training. Why: one master copy, no duplicates.
- Mail Keep/Ignore preferences live as `mailPreferences` in the owner-only `finance_receipts.doc` (`src/lib/mail-preferences.ts`), written only via `casUpdateFinanceDoc` with change-verified readback; ingestion applies them before reading bodies (message choice by mailbox+ID, sender rules by exact normalized address, Keep precedence), and Elsie changes rules only through the deterministic `parseMailRuleCommand` path naming an exact address. Why: explicit reversible owner rules, never model-invented or self-learned filters.

## Room snapshots
- Room identity comes only from `src/lib/office-room-identity.ts` (office map first, exact route match, no Reception fallback); RoomShell, RoomReports, room commands and snapshots use it. Why: Research/Family Continuity were mislabelled as Reception.
- Every room view (RoomAccessBar) and every typed/voice Elsie request read the same owner-token snapshot contract (`src/lib/room-snapshot*.ts`); sources are labelled live/device/static, Finance-doc sources need AAL2; device-only sources are read only from a fresh same-room device report (`room-device-snapshot.ts`, untrusted) else device-unavailable; a room is fully verified only with every live+device source read, a known build id, and the owner's Build & Testing room check only after the owner runs Build & Testing's room check on the current build. Why: one truthful source for John and Elsie, never a green light from connectivity alone.

- Brain is the Office hub: `src/lib/brain-index*.ts` indexes existing records into Downloads/Knowledge/Discussions/Memory/Projects/Rules & Skills by explicit provenance only (unknown → Needs a category); manual filing is a separate deterministic-id label row in office_notes (source "Brain index: category") with readback, never a move. The same index feeds BrainHub, the /brain room snapshot and Elsie per request (metadata only). Why: one categorized registry without schema changes or touching originals.

- Project register (`src/lib/project-register*.ts`) is built only from saved owner office_notes with source "Lovable project import"; category and John's plan (goal/room/stage/next move) are separate label rows (sources "Project register: category" / "Project register: plan", read back); project-locator.ts joins tasks only by exact project UUID or plan-linked task id, and ready/market/completed come only from John, never edits to import records, and the app never seeds project records. Why: imported metadata must stay intact and real.

## GitHub saving and publication — standing authorisation, 4 October 2026
John explicitly requested automatic publication after every completed CanX Office application change (major or minor), especially at the end of the day, and that changes be pushed to GitHub. His follow-up at 11:42 AM on 4 October clarified that this applies as office changes are made. This supersedes older preview-only/no-publish instructions for completed, owner-requested CanX Office updates. It does not apply to Safe Highways or other projects.
- Finish every completed CanX Office application change by running checks appropriate to the change, committing and pushing to the connected `canericaextreme/CanX-Office` branch, confirming Lovable has synced that commit, then publishing project `52572715-7d7c-4c7a-85cb-96664ada3394` to the existing `https://canx-office.lovable.app` address. Do not ask again for ordinary publication already authorised here.
- At the end of a work day, reconcile completed changes with GitHub and the published office. Publish completed updates that passed checks; leave incomplete or failed work staged and explain the exact blocker. An explicit later request to keep a change private overrides this default for that change.
- Preserve user records, secrets, budgets, authentication and rollback history. No force pushes, secret exposure, new spending, provider subscriptions, database migrations or unrelated changes are authorised by this release policy.
- Record the source commit and deployment result. A pending deployment is not a successful publication. Publishing and signed-in functional verification are separate: do not mark health or voice verified merely because publication succeeds.
- A ChatGPT evening release automation is a release check, not a continuous signed-in Office health monitor. Existing owner/MFA health requirements remain.

## Owner-only connection shutdown — 4 October 2026
John explicitly requested that only he may turn off either Claude or ChatGPT/Codex once connected. Neither colleague may disable, revoke, remove, replace, or sever the other's Office access on its own initiative. Changes to either connection's enablement, credentials, routing, or removal require John's explicit instruction for that change; ordinary coding or standing publication authorisation does not authorise shutdown. Build candidates affecting these controls must remain proposals until that owner instruction is present. Do not claim the Office can disable the external ChatGPT or Claude account.

## Office builders
- Builder choice comes only from John's current words (`src/lib/builder-choice.ts`): Codex by default, Claude only when named, both named = refuse; direct build tools re-check the actual request, and task execution records `office-task-v2` builder identity (legacy `codex-task-v1` = Codex) with one attempt per request and no fallback. Why: a model tool call must never switch builders or cause duplicate paid builds.
