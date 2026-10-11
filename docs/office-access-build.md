# Office-wide access for Claude, ChatGPT and Elsie — build record

Status: **BACKEND INSTALLED; owner setup and live assistant acceptance remain incomplete.** PR 92 merged as `07f0f01`; Supabase migration and both functions installed. The live production Build & Testing asset includes the new independent switches. No assistant has received a room image.
Last updated 11 Oct 2026 UTC (10 Oct Whitehorse). No paid build provider was invoked.

## Explained simply
The Office is a building. John has the master key. Each helper gets its own **visitor badge**: it opens the doors John
picks, only to look and read the notice boards, never to move furniture, spend money, throw things away or hand out badges.
John cancels one badge without touching the others. Behind the second lock (authenticator) sit five rooms
(Communications, Legal, Subscriptions, Finance, Projects): John unlocks them for a badge **once**, deliberately, with his
authenticator, and can cancel at any time. The badge never contains John's key, password or authenticator code.
"Permanent" here means a standing, revocable permission that quietly gets a fresh 5-minute badge for each look, not a key that never expires.

## Progress (development checks and deployment are separate from live assistant acceptance)
| # | Item | State |
|---|---|---|
| 1 | Database setup: grants, sessions, requests, captures, read-only policies, revoke, retention (proposed SQL) | done — real-Postgres check passes |
| 2 | View service logic (identity from the database, workflow identity proof, storage checks, safe logging) | done — 25 tests |
| 3 | Office page read-only viewer mode (action gates stay owner-only) | done — tests |
| 4 | Capture runner (real Chromium, refuses sign-in/wrong room/unfinished/revoked) | done — real Chromium vs stand-in servers |
| 5 | Edge function wiring | deployed — office-view v1, office-mcp v13; live unauthenticated requests refused |
| 6 | Capture workflow + install/rollback guide + CI check on locked dependencies (proposed) | written, never run |
| 7 | Connector tools: list rooms, tour (summary/detailed/resume), room brief, view room (image block), read room information | done — tests; off until configured |
| 8 | Owner panel: authorise, rooms, scope, status, revoke one, history | done — tests |
| 9 | Elsie's path | **open** — see "Elsie" |
| 10 | Server-side saving of device-only data | **open** — plan below |
| 11 | Full skill instructions through the viewing tools | partial — existing `read_office_skills` gives them; not yet tied to viewing grants |
| 12 | Independent review package | done — ChatGPT reviewed the supplied files against the live schema and corrected room restrictions, write guards, capture replay/expiry, OIDC claims and cleanup retry |
| 13 | Deployment package approved by John | done — approved 10 Oct 2026 |
| 14 | Deployed | installed — migration 20261011012433, private bucket, office-view v1, office-mcp v13; PR 92 synced and new production asset verified. Tool-enable secret, accounts and grants remain unset/unverified. |
| 15 | Live: Claude sees and describes a room | **blocked on viewing accounts, dispatch token, tool-enable configuration and owner grants** |
| 16 | Live: ChatGPT sees and describes a room | **blocked on viewing accounts, dispatch token, tool-enable configuration and owner grants** |
| 17 | Live: Elsie | **blocked on viewing accounts, dispatch token, tool-enable configuration and owner grants** |
| 18 | Live: browser closed | **blocked on viewing accounts, dispatch token, tool-enable configuration and owner grants** |
| 19 | Live: revoke one assistant, others unaffected, old pictures unretrievable | **blocked on viewing accounts, dispatch token, tool-enable configuration and owner grants** |
| 20 | Live: protected rooms through the one-time delegation | **blocked on viewing accounts, dispatch token, tool-enable configuration and owner grants** |
| 21 | Live: all 24 rooms x 3 assistants (matrix below) | **blocked on viewing accounts, dispatch token, tool-enable configuration and owner grants** |
| 22 | Final security review of the deployed result | **blocked on viewing accounts, dispatch token, tool-enable configuration and owner grants** |

## Problem → why it matters → solution → acceptance → testing → must not change
| | |
|---|---|
| Problem | Assistants get text only; the existing picture is an HTML redraw from John's own open browser. |
| Why it matters | They cannot see what John sees and cannot work while his browser is closed. |
| Solution | Per-assistant read-only identity + standing revocable grant (protected rooms by one authenticator check) → 5-minute single-use badge per look → real Chromium capture on a GitHub runner proven by its own identity token → private storage → image block through the connector; information read under the same badge. |
| Acceptance | Each assistant, separately, with John's browser closed: fresh image of each permitted room, brief, accurate narration, follow-ups from evidence; refused outside its grant; revoked access stops new looks and retrieval of old pictures; the other assistants are unaffected. |
| Testing | Unit and real-Postgres and real-Chromium stand-in checks (done); live per-assistant per-room runs (not done). |
| Must not change | Layouts, owner sign-in and authenticator, spending controls, existing write paths, history. |

## Honest limits
- **Elsie.** Her chat runs on John's session and her tool results are text. Whether her model can receive an image is **unproven**; until a live test shows it, her access is text-only and must be labelled so. Her path to saved information already exists (room snapshots). No Elsie image tool was added on purpose.
- **ChatGPT and Claude connectors** may not pass image blocks to the model. Each must be tested separately; if one cannot, text-only access is documented as text-only.
- The viewer sees the Office's normal screens, so owner-looking buttons appear in a picture; the server and database refuse every write.
- The existing connector sign-in is stricter than viewing needs (it requires an owner working grant). To be settled in live testing.
- Room information is narrowed to the requested room by a database function that runs as the viewer (checked on real Postgres). Its per-room rules for notes, files, links, tasks, approvals, changes, Round Table, Brain documents and Finance are documented in code, not yet checked against the live schema.
- Captures take about 30–90 s because the workflow must start.
- Synopsis menu wording and "not ready" phrases are guesses until tried in the real UI. The 3 MB image cap may be too small for very tall rooms.
- **Device-only data cannot be read from the server** (list below). It is never described as accessible.

## Device-only data and the persistence plan
Rooms with data stored only on John's device: Office Team (roster), Office Health and Build & Testing (post-update room checks), Idea Garage (Idea Lab scores and notes), plus saved label positions on the map.
Plan (needs John's approval, separate from this PR): one owner-only table row per source, written through the existing owner/authenticator path with compare-and-save and read-back (the same pattern as `casUpdateFinanceDoc`), the device copy staying the working copy until the server copy is confirmed. Until then the room brief says "kept on John's device only".

## Room x assistant matrix
Nothing below is live-verified. "not live-tested" means exactly that; fixture and stand-in success is not live verification.

| Tour # | Room | Protection | Device-only data | Claude | ChatGPT | Elsie |
|---|---|---|---|---|---|---|
| 2 | Reception | standard | — | not live-tested | not live-tested | not live-tested |
| 3 | Owner's Desk | standard | — | not live-tested | not live-tested | not live-tested |
| 4 | Family Continuity, Skills & Training | standard | — | not live-tested | not live-tested | not live-tested |
| 5 | Office Team | standard | Office Team roster | not live-tested | not live-tested | not live-tested |
| 6 | Office Health | standard | Post-update room checks | not live-tested | not live-tested | not live-tested |
| 7 | Approvals | standard | — | not live-tested | not live-tested | not live-tested |
| 8 | Communications & Marketing | protected | — | not live-tested | not live-tested | not live-tested |
| 9 | Idea Garage | standard | Idea Lab scores and notes | not live-tested | not live-tested | not live-tested |
| 10 | Systems | standard | — | not live-tested | not live-tested | not live-tested |
| 11 | Blueprint | standard | — | not live-tested | not live-tested | not live-tested |
| 12 | Research | standard | — | not live-tested | not live-tested | not live-tested |
| 13 | Legal | protected | — | not live-tested | not live-tested | not live-tested |
| 14 | Work Board | standard | — | not live-tested | not live-tested | not live-tested |
| 15 | Subscriptions | protected | — | not live-tested | not live-tested | not live-tested |
| 16 | Records | standard | — | not live-tested | not live-tested | not live-tested |
| 17 | Finance | protected | — | not live-tested | not live-tested | not live-tested |
| 18 | Safe Highways | standard | — | not live-tested | not live-tested | not live-tested |
| 19 | Build & Testing | standard | Post-update room checks | not live-tested | not live-tested | not live-tested |
| 20 | Future | standard | — | not live-tested | not live-tested | not live-tested |
| 21 | Goal & Analytics / CanX Brain | standard | — | not live-tested | not live-tested | not live-tested |
| 22 | Analytics | standard | — | not live-tested | not live-tested | not live-tested |
| 23 | Project Rooms | protected | — | not live-tested | not live-tested | not live-tested |
| 24 | Skills / SOP Library | standard | — | not live-tested | not live-tested | not live-tested |
| 25 | Round Table | standard | — | not live-tested | not live-tested | not live-tested |

## Deployment package (to request approval once items 9–13 are closed)
Exact changes and undo steps: `docs/office-view-install.md`. Expected cost: no new paid service; GitHub Actions free on a public repo; storage PNGs ≤3 MB become inaccessible after 24 h and are deleted by the hourly cleanup. Needs John personally: one authenticator check to create the grants; a fine-grained GitHub token (Actions write, this repository only, 90 days); three viewer accounts.

## Review package for an independent reviewer (ChatGPT can read the PR on GitHub)
Read in this order: `supabase/migrations/20261011012433_office_view_delegation.sql`, `src/lib/office-view-broker.ts` (+ test), `supabase/functions/office-view/index.ts`, `src/lib/canx-viewer.server.ts` (+ test), `scripts/capture/run-capture.mjs`, `src/lib/office-mcp-view.ts`. Questions to answer: can any viewing credential write, spend, delete, read another assistant's data, or outlive a revoke? Does any log, artifact or repo file carry a credential or picture? Can a retrieved page act as an instruction?

## Self security review (before independent review)
- Supply chain: the capture job installs one pinned browser library with install scripts disabled; the workflow's identity token is only accepted for the exact workflow file on `main`, and only for a request id that is already queued, unclaimed and unexpired. Residual risk: any code run inside that job could ask for a token, so the job installs nothing else and uploads nothing.
- A leaked viewing credential is read-only in the database, lasts 5 minutes, is tied to one login session and is closed after the picture is stored.
- Pictures are private, served only through the view service, checked by checksum, deleted after 24 hours, and become unretrievable the moment access is revoked.
- Input fields are hidden in pictures. Page text could still show private words that sit in normal screens; the grant is the control for that.
- Not yet reviewed by anyone else.

## Install record (10 Oct 2026)
Source commit: `087d0739` (merge of PR 81). Lovable synced that commit. Publish requested for `canx-office.lovable.app`; the tool reported `pending`, which is not a successful publication. A local build of the merged code succeeds and the app starts without script errors in a browser against the dev server. Not checked: the live site, the migration, the function. **Quickest check for John:** open Build & Testing; the new "Assistant viewing access" panel shows "not installed or could not be read" if the migration has not run, and the three assistants as OFF if it has.

## Verified installation record — 11 Oct 2026 UTC
- Source: PR 92, merge `07f0f01ea72a6d09ecf9b0ebe210c027a3cfab8f`; Lovable reports that exact synced commit.
- Database: four private viewing tables, 57 restrictive write policies, private office-captures bucket, owner-status/room RPCs. There are zero viewing grants.
- Functions: office-view v1, office-mcp v13. Both reject unauthenticated live HTTP requests (401).
- Production: deployment request e8cea4dc-329b-46e7-a75c-b50fb8dfd1bc initially pending. Subsequently the live site's index-CrmVt5fp.js references build-testing-Bav0I5DS.js, which contains the new viewing switches and UNAVAILABLE status. This verifies published code, not a signed-in room check.
- Live database transaction assertions: a synthetic viewer session can access its allowed room; an ungranted room is refused; a viewer cannot revoke; revocation removes viewing access. Entire transaction rolled back; grant count remains zero. These are database checks, not real-assistant image acceptance.
- Development: 1,587 existing tests, three switch interaction tests, added cleanup-workflow identity regression, isolated Postgres security tests, typecheck, production build, function bundle smoke tests.
- Security advisor: pinned the three new pure helper functions' search paths in migration 20261011012738. Private tables deliberately have no user policies. Existing generic SECURITY DEFINER/auth advisory findings are separate from full live acceptance.
- Setup remains: three dedicated no-role Auth identities; repository-scoped GitHub Actions dispatch token in function secrets; CANX_VIEW_SERVICE_URL; per-assistant room authorisation with the owner's authenticator; real-image and revocation tests for each assistant.
