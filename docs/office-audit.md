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
| 15 | Build & Testing | change log, device room checks | Post-update Room Check | Owner-triggered only; Claude API and build routes added, live runner verification pending; shared GitHub status failure under diagnosis |
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

## Claude coding and builds (4 October 2026)
- Claude has a separate on-demand build entry in Build & Testing, targeting `canericaextreme/CanX-Office` only. Its `canx-claude.yml` runner edits allowed source files and the fixed runner runs typecheck/tests/build. A separate trusted publisher opens a draft change; Claude itself has no GitHub write or deployment credential. Completed checked changes follow the owner's standing release policy. This is not equivalent to all connectors available in this ChatGPT session.
- John approved US$10 per build. The CLI uses `--max-budget-usd 10`; no automatic larger budget or retry is authorised. Builds require the shared private GitHub dispatch connection and owner/MFA verification. GitHub Actions requires a separate repository secret for the Claude API; presence and a real successful build are not yet verified.
- `claude-chat` is a separate Supabase Edge Function reading the existing Vault key at request time. The browser invokes it by name. It validates owner/MFA, checks existing budget reservations before paid replies, exposes a non-billable models check, and never returns the key. A chat reply is not a code edit or build.
- No Finance or Elsie voice source file was changed. A live owner-authenticated Claude reply and build remain required before marking either path verified.


## Shared build status diagnostics (4 October 2026)
- John reported the same request/response processing error from Claude and Codex status checks. The root cause and both live runners remain unverified.
- Both bridges now report the fixed GitHub operation, request/JSON/processing stage, HTTP status when available, and an allowlisted cause code. Raw exception text, response bodies, headers, credentials and owner tokens are never included. Status checks remain GET-only; dispatch failures never trigger retries.
- After publication, repeat both owner-authenticated status checks and record the displayed diagnostic before changing any credentials or routing.

- Live owner check on the diagnostic update returned `GH_REDIRECT_REJECTED; workflow list; request; GET`. Both bridges now use manual redirect mode; a redirect response is reported as a safe HTTP status, never followed. A direct unauthenticated endpoint read succeeded, but owner-authenticated Office status still requires retesting after publication.

- The live manual-redirect revision returned `GH_HTTP_403; workflow list; GET`. Both GitHub wrappers lacked an explicit `User-Agent`, required by GitHub REST. Added a fixed application identifier to GET and POST requests and regression assertions for both providers. No credentials or connection settings changed. The authenticated live status check and runners remain unverified until the owner retests this revision.

- John confirmed both live status checks now succeed after the User-Agent repair. Codex lists historical successful runs; this does not verify a new build. Claude has not yet completed a paid build. Lowered the Office-dispatched Claude API budget from US$10 to US$2 for the requested test, and display the actual configured limit in the authenticated read-only Claude status response. The workflow still passes this input to `--max-budget-usd`; no paid test has been dispatched by this change. Elsie's Claude dispatch route remains outstanding.

- John submitted the US$2 Claude connection test through the Office and reported an accepted request with a queued run ID. Completion, draft PR and actual spend are not yet verified. Added a queued/running activity indicator and 15-second read-only status refresh while the Claude panel has an active run; polling stops on terminal results, loss of owner session, errors or unmount. No build dispatch is retried and Send is disabled while a run is known active. Owner verification of the new indicator remains pending.

- The first US$2 Claude test (GitHub run 37246771315) completed its implementation step but failed candidate validation: two legacy companion Work assertions expected the removed Work-button label and prohibited the owner-requested direct ChatGPT link. The proposal job was skipped; actual API charge is unknown. Updated those assertions to require the exact ChatGPT destination, accessible label, new-tab target and noopener/noreferrer settings; retained the internal panel's no-iframe/no-scripted-window protections and existing auth/provider safety tests. No paid retry was dispatched.

- Claude test run 37247896211 passed implementation and fixed-runner validation, and the trusted proposal job opened draft PR #61 with only docs/claude-builder-test.md; neither merged nor published, and actual API cost remains unverified. John also confirmed the Claude activity indicator and automatic terminal status update. Added the same queued/running indicator and 15-second read-only polling to Build with Elsie and Codex, with in-flight guards and Send disabled for known active runs. Polling stops on terminal results, session loss, error or unmount; it never dispatches or retries a build. After a refresh, Check connection and builds loads any existing active run. Elsie's Claude route remains outstanding.

## Elsie ↔ Claude/Codex connection matrix (5 October 2026)
| Capability | Status | Notes |
|---|---|---|
| Elsie typed/voice: send green Office code task to Codex (`start_codex_build`, Work Board auto-handoff, `execute_task`) | Executable (owner + AAL2) | Default builder when John names no builder. |
| Elsie typed/voice: send green Office code task to Claude (`start_claude_build`, same task paths) | Executable (owner + AAL2) | Only when John's current words name Claude. Server re-checks request, risk and protected categories; model cannot switch builder. Both builders named = refused. |
| Builder status (`check_codex_builds`, `check_claude_builds`, exact "Check Claude builds" / "Check builder connection") | Executable, read-only | Answered before any paid Elsie call; voice uses fixed commands. |
| Saved-task status (`check_task_execution`) | Executable, read-only | Uses the builder recorded on the task (`office-task-v2`; legacy `codex-task-v1` = Codex). |
| One attempt per request | Enforced | Compare-and-set claim before dispatch; never retried, never falls back to the other builder; conflicting builder after an attempt is refused. |
| Claude panel "Hand to Elsie" | Executable via Elsie | Sends John's typed request through `managerChat` with `/build-testing` route and build id; shows Elsie's verified action results. Claude does not run Office tools itself. |
| Claude coding advice (`claude-chat`) | Read-only advice | Text only; no tool calls. Separate from builder credentials. |
| External ChatGPT session tools/connectors | Not transferable | ChatGPT's connectors cannot be moved into the Office automatically. |
| External ChatGPT → Office conversational API/connector | Not connected | No registered connector; no public unauthenticated endpoint was added. |
| Live verification | Pending | Code and unit tests only. Requires John signed in with two-step verification to run a real Claude handoff; no paid build was run by this change. |

Remaining owner setup: none new. Existing settings (shared GitHub token, US$2 Claude cap, enablement flags, Actions `ANTHROPIC_API_KEY`) are unchanged.
