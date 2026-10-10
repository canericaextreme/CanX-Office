# Shared room-image access — design, evidence and status

Draft for John's review. Date: 10 October 2026. Nothing here is deployed, merged or published.

## Goal

When John says "go look at the layout", an assistant gets a fresh picture of the real, rendered room and judges organisation, readability, spacing and anything hiding content — without John taking or pasting screenshots.

## What was checked, and how

| Question | Finding | How it was verified |
|---|---|---|
| Does the open Office already give a real screenshot? | **No.** "Observe Office" redraws the page's HTML onto a canvas with `html2canvas-pro`. | Read `src/lib/office-observe.ts`. |
| Can an assistant ask for it? | **No.** It runs only when John presses the button, in his own open, signed-in browser. | Same file (its header says so). |
| Is a redraw good enough to judge layout? | **No.** Side-by-side on a fixture page, the redraw changed the 3-D shelves, lost the frosted panel's text and cannot show a hover bubble. A real Chromium screenshot kept all of it. | Ran both on the same fixture (see "Evidence"). Fixture, not the live Office. |
| Real pixels with no server? | Only through the browser's screen-share prompt. That needs John's click each time, cannot be asked for by an assistant, and cannot hide secrets inside the shared picture. The repo also deliberately avoids it. | Browser behaviour from documentation; **not tested here**. |
| Does the Office connector return images? | **No.** Every tool result is text (`content:[{type:"text"}]`). No image tool exists. | `src/lib/office-mcp.ts`, lines 91 and 100. |
| Can any assistant read an image delivered that way? | **Untested.** There is nothing deployed to test, and deploying needs John's approval. | — |
| Repo read access (this session) | **Pass.** Anonymous clone worked. | `git clone`, HEAD `414891a`. |
| Branch-push access (this session) | See PR description for the push result. | `git push`. |
| Build/check access | Dependencies could **not** be installed from the lockfile's private registry (HTTP 403). They installed from public npm in a scratch copy, so versions differ from the lockfile. | `bun install --frozen-lockfile` failed; scratch install worked. |

## Why independent capture needs a server browser

An assistant asking on its own means John's browser may be closed. Only a browser running somewhere else can answer. It must (1) open the room as the owner, (2) hide secrets, (3) take a real screenshot, (4) put it somewhere private, and (5) let the assistant fetch it through a signed-in connection.

The hard part is step 1. The Office is behind owner sign-in. A server browser has no session. That needs an owner-approved way to give it a short, narrow one. **This PR does not build that.**

## Options

| | A. Keep redraw only | B. One-time tab share | C. Server browser (recommended) |
|---|---|---|---|
| Real pixels | No | Yes | Yes |
| Assistant can ask alone | No | Only while John's tab is open and shared | Yes |
| John's browser must stay open | Yes | Yes | No |
| Secrets hidden | Yes (existing rules) | No — the page is shared as-is | Yes (mask applied before the shot) |
| Mobile view and open bubble | No / maybe | Only what John's own window shows | Yes |
| New permissions | None | Reverses the "no screen capture" rule | See below |
| Extra cost | None | None | See below |

## Recommended build (needs John's approval, step by step)

1. **Capture script** — included in this PR (`scripts/capture/capture-room.mjs`). Real Chromium, desktop and mobile, full page, hover bubble held open, form fields and no-capture areas hidden, JSON record with room, route, time, viewport, build version, state and checksum.
2. **Rules file** — included (`src/lib/room-capture.ts`) with tests. All 24 rooms, two-step tiers, viewport sizes, record validation, freshness.
3. **Not built yet — each needs a decision:**
   - A GitHub Actions workflow to run the script (workflows are a protected area).
   - A way to open the room as owner. Candidate: the Office's edge function (which already holds the server key) issues a **5-minute, single-use, AAL1** session to the running job, proved by GitHub's OIDC token. Rooms that need the authenticator (AAL2) stay closed to it. This is my suggestion and needs a security review.
   - A database table and a **private** storage bucket with owner-only row security.
   - Two new connector tools in `supabase/functions/office-mcp`: ask for a capture, and read a capture back as an image.
   - Deploying the edge function.

### Costs and permissions

- GitHub-hosted runner time: the repository is public, so standard runner minutes are free. Playwright installs without changing `package.json`.
- Storage: small PNG files (about 70–110 KB each in the fixture test) in the existing Supabase project; plan limits not checked.
- Vision tokens: each time an assistant looks at an image, the provider charges for it under the existing Office spending controls. Not measured yet.
- **Public-repo warning:** workflow logs and artifacts of a public repository can be read by other people. Captures must **never** be stored as workflow artifacts or printed in logs. They must go straight to the private bucket.
- Approvals needed from John: workflow file, GitHub secrets, the session-issuing function, the migration, the connector tools, deployment. Spending approval is a separate decision.

## Two-step rooms (updated 10 Oct)

Communications, Legal, Subscriptions, Finance and Projects are the Office's own two-step rooms. They can be captured only inside a window John opens with his authenticator. The other 19 rooms (including Brain) use the standard tier. Earlier drafts of this document listed a different withheld set and 20 rooms; that was wrong. See docs/office-access-build.md.

## Evidence in this PR

All pictures below were made from **fixture pages**, not the live Office, because the live Office needs John's sign-in and authenticator.

- Real Chromium vs HTML redraw on the same fixture: real kept the dark background, tilted shelves, frosted panel text and a hover bubble beside its button; the redraw changed the shelves, lost the panel text and cannot show hover.
- Five script runs against local fixtures at `http://localhost`: Brain desktop, Brain mobile, Brain desktop with the bubble open, Legal desktop, Legal mobile. Each wrote a PNG and a JSON record; all five records pass `validateCaptureMeta` and their checksums match the images.
- Masking: the password field and a no-capture panel were absent from every masked capture.
- Refusals: Finance (two-step), an unknown route and a plain-http remote address all stopped with exit code 2 before opening a browser.
- Unit tests: `src/lib/room-capture.test.ts` (9 tests) pass in a scratch install.

## Acceptance status

| Check | Status |
|---|---|
| Real Brain and Legal screenshots of the **live** Office | **Not done** — needs sign-in mechanism |
| Desktop, mobile and open-bubble captures | **Passed on fixtures only** |
| Each assistant retrieves and describes the same captures | **Untested** — no image tool exists |
| Record has room, route, time, viewport, build version | **Passed** (rules and fixture runs) |
| Signed-out retrieval refused | **Untested** — no retrieval endpoint exists |
| Brain notes saved and read back | See PR description |

## Per-connection results (image retrieval and analysis)

| Connection | Result |
|---|---|
| Claude (Office API) | Untested |
| ChatGPT (Office API) | Untested |
| Elsie | Untested |
| External Claude chat | Untested |
| External ChatGPT chat | Untested — connection plan shows authorisation still pending (8 Oct 2026) |

"Viewing a captured room" is not "navigating it". Even when this works, an assistant sees a still picture and cannot click around.

## John's design preference (recorded, not applied)

Synopsis bubbles appear beside their buttons, keep shelves and controls visible, and close when the pointer leaves. No room layout is changed by this work.
