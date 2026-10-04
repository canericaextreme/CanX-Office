# CanX Office — whole-office wiring checklist

Baseline 4 Oct 2026 (UTC). Source of truth in code: `src/lib/office-map.ts`, `src/lib/room-snapshot.ts`, `src/lib/office-skills.ts`, `src/lib/office-audit.ts`.
Elsie can produce the live version of this table on request ("check all the rooms"). That run reads each room fresh as the owner; nothing here is owner-verified.

Levels: **Code** = written and tested by fixtures · **Read live** = Elsie reads it with the owner's session · **Owner verified** = John opened it signed in on the current build (none yet).

| # | Room | Saved data Elsie reads | Installed procedures | Missing input / next task |
|---|---|---|---|---|
| 01 | Reception | tasks, approvals, notes, files, reports | Classify, Route, Missing info, Daily Review, Router | No background room monitor |
| 02 | Owner's Desk | approvals, decisions | Daily Review, Decision Filter, Decision History | — |
| 03 | Approvals | approvals | Spend, Destructive, High-risk, Decision Filter | — |
| 04 | Idea Garage | static cards; Idea Lab device-only | Capture, Score, Park/Promote, Duplicate | Idea Lab scores stored on device only; no market research tool |
| 05 | Office Team | roster device-only | Roster & Capability Review | Shared roster storage |
| 06 | Records | notes, decisions | Brain jobs, Provenance Check | — |
| 07 | Blueprint | static | Layout Change Record | No automatic visual comparison |
| 08 | Systems | change log, static connections | Security (3), Settings (4), Incident Triage | No access-log/security feed; no credential rotation tool |
| 09 | Office Health | change log, device room checks | Office Health Summary, Daily Review, Incident Triage | No background monitor |
| 10 | Communications | billing-email evidence | Outreach (4), Marketing Review | No general inbox reader; no send tool; no campaign analytics |
| 11 | Legal | files, reports only | Legal (4) | No legal research or counsel connection |
| 12 | Subscriptions | subscriptions, mail evidence, mail rules | Subscriptions (4), Finance (4) | No vendor usage data; no exact receipt linkage |
| 13 | Finance | receipt totals (two-step) | Finance (4) | No bank/accounting ledger |
| 14 | Work Board | tasks, change log | Operations (4), Foreman (4) | No crew dispatch / calendar |
| 15 | Build & Testing | change log, device room checks | Post-update Room Check | Owner-triggered only |
| 16 | Safe Highways | static boundary | Defect Review + 4 advisory jobs | Never reads/changes Safe Highways (by design) |
| 17 | Research | files, reports only | Source Check, Evidence, Brief, Standards | No web/standards search tool |
| 19 | Family Continuity | skills registry | Training (4) | No learner records |
| 20 | Future | — | Reserved | Reserved by John |
| — | Brain | Brain index, memory, decisions | Decision History, Brain (3) | — |
| — | Projects | project register, tasks | Projects (4) | External repos/deployments not connected |

## Build handoff (what Elsie can build with)
- Exists in code: Elsie's `start_codex_build`, `execute_task` (green Office code tasks), `check_codex_builds`, `check_task_execution` → GitHub Actions `canx-codex.yml` on `canericaextreme/CanX-Office` (`main`). The job runs Codex, then typecheck/tests/build, and opens a **draft change** only. Elsie never merges, publishes or deploys.
- Server settings present (names only): `CANX_CODEX_GITHUB_TOKEN`, `CANX_CODEX_ENABLED`, `OPENAI_API_KEY`. Whether the GitHub token can dispatch, whether the repository variable `CANX_CODEX_ENABLED=true` and the repository secret `OPENAI_API_KEY` are set on GitHub is **not verified** from here. The whole-office check runs a read-only workflow listing to report it.
- Difference from this builder: this assistant edits the Lovable project directly. Elsie works only through the GitHub draft-change pipeline above and does not have this assistant's access.

## Readiness levels (4 Oct 2026)
Installed = instructions present · Connected = every input readable · Executable = a real Elsie action runs it · Blocked = a named input is missing. Executable today: Skill Router, Owner Decision Filter, Daily Office Review ("check all the rooms", saved as an Office Health room report), and the eight Subscriptions/Finance procedures ("follow all the skills in the Subscriptions room", saved as a Subscriptions room report). Research Source Check and Security Incident Triage are blocked (no web/standards search, no security-event feed). Gaps with no approved definition: Analytics, Family Continuity instructions.

## Open next tasks
1. Shared storage for the Office Team roster and Idea Lab scores (would need a schema change, so John must approve).
2. Owner opens each room signed in on the current build (release gate).
3. Confirm the GitHub repository variable/secret for the Codex job, then run one owner-requested build.
