# Room pictures: working version and deployment steps (14 Oct 2026)

## What is proven live
On 14 Oct 2026, Claude's claude.ai "canx office" connector received real, fresh pictures of two Office rooms:

| Room | Captured (UTC) | Image SHA-256 | Office build |
|---|---|---|---|
| Reception `/reception` (run 38500585213) | 02:22:30 | `92dbc12ba7c43f5bf686a51d2a62034defe7a099018f4c471a9d2232dbedc898` | `index-BkcfyTdi.js` |
| Legal `/legal` (run 38500906927) | 02:26:22 | `4508eb24895d4b860e62b67ae1348c7578cfd279e1159ea0a4c5c19b38fafcdf` | `index-BkcfyTdi.js` |
| Work Board `/work-board` (run 38505603254) | 03:20:06 | `2545119db305cd2bec1604f87d66ccb7f5d1fbd625a38fe9db05f532f2024692` | `index-BkcfyTdi.js` |
| Legal `/legal` (run 38632147077) | 20:28:25 | `2a516a029d180a1c992a4d3b00b6dda0eef637570393554801fd41d4ccae495b` | `index-BkcfyTdi.js` |

The same day, `read_room_information` returned real saved content for `/brain`: 62 notes, 11 files and 13 documents. Reception and Safe Highways came back empty because no notes are tagged to them (`canx_view_note_routes`).

**How a picture arrives:** the first `view_room` call usually returns `{"status":"pending","requestId":...}`. Calling `view_room` again with the same route and that `requestId` returns the picture. A capture run takes about 75–80 s, and an assistant waits only about 60 s for one tool call.

**Not proven:** ChatGPT, Elsie, mobile viewport, `synopsis_open` state, rooms other than Reception and Legal, revoke-then-refuse.

## Exact working version
- Git: `main` at **`ad069a10646f4ee6f4eee71a5258efd566a8d9dc`** (merge of PR #99). To get exactly this version: `git checkout ad069a10646f4ee6f4eee71a5258efd566a8d9dc`.
- Changes that made it work: PR #98 (runner's Chrome, shorter waits) and PR #99 (pending + collect by `requestId`, timing notices).
- Deployed function bundles were built from this commit with `scripts/office-view/bundle-functions.mjs`. Rebuilding from this commit gives byte-identical files:
  - `office-mcp.js` sha256 `dbac8bc3460d0c4938f40dc58a7162ad5b8df8b6214d0d88168d8d93edaa3cd9` (194,019 bytes)
  - `office-view.js` sha256 `e43052ff3d755a5bc39435006bd93e406af18fa274a13f8244fc952f4f4b8579` (28,732 bytes)
- Capture workflow: `.github/workflows/office-view-capture.yml` as of that commit. It only takes effect from `main`, because the view service accepts only that exact workflow file on `refs/heads/main`.
- Unchanged and already in place before this work: database migration `20261011012433_office_view_delegation.sql`, the private `office-captures` bucket, viewer accounts and grants, the GitHub dispatch token, and the connector OAuth. None of them were touched.

## Deployment steps (as done on 14 Oct 2026)
> **Superseded 15 Oct 2026:** functions now deploy automatically on merge to `main`. See `docs/office-functions-auto-deploy.md`. The manual steps below are history and an emergency fallback only.

1. **Merge the PR into `main`** on GitHub. This alone activates any change to the capture workflow.
2. **Build the two function files** from the merged commit, in a folder with `esbuild` installed:
   `node scripts/office-view/bundle-functions.mjs <outputFolder>`
   The script also checks that each bundle loads and refuses an unauthenticated call. Only `office-mcp.js` and `office-view.js` are needed. Leave `office-consent.js` alone unless it changed.
3. **Deploy office-mcp:** open https://supabase.com/dashboard/project/gmsjjiprtulxojhkmbqb/functions, then **office-mcp**, then **Code**. Replace all of the code with `office-mcp.js` and click **Deploy updates**. Change no secrets and no "Verify JWT" setting.
4. **Deploy office-view** the same way with `office-view.js`.
5. **Check:** the first line of each deployed file reads `// <name>: generated from supabase/functions/<name>/index.ts`, and the version number went up.
6. **Live test:** from an assistant, call `view_room` for a granted room, then call again with the returned `requestId`. Success means an image comes back with `"freshness":"fresh"`.
7. **Timing (optional):** each capture run records `Capture timing` notices, readable at `GET /repos/canericaextreme/canx-office/check-runs/{job_id}/annotations`.

## Undo
Rebuild the bundles from the previous working commit (for example `62a8a82`, the merge of PR #98) and paste them in the same way. Revert the workflow by reverting the PR on `main`. No database change is involved.

## Known slowness (next improvement, not required)
Timing notices on 14 Oct showed that `npm install playwright@1.49.1` takes about 54 s of each run, while the runner's Chrome 154 is ready immediately. Caching that install would likely bring captures under 60 s, so one call would be enough.

## Evening acceptance test with John (14 Oct 2026, 20:26–20:31 UTC)
- A fresh Legal picture arrived through pending + collect, 93 s after the request (run 38632147077, 20:26:56–20:28:29).
- A pixel comparison with the 02:26 Legal picture found only one changed strip, the "saved room records read …" timestamp. The live build was still `index-BkcfyTdi.js`. Lovable's edit history showed no app edit after 03:31 UTC, so an expected "update" had not been published. **Lesson:** a picture shows only what is published at `canx-office.lovable.app`.
- John's checks, answered from the picture:
  - 12 topic cards (20 card-style boxes in all).
  - Blue cards: 3 clearly blue by pixel colour (Contracts & Agreements, Insurance & Liability, and the "Your legal papers, in order" banner), plus 2 borderline (Privacy & Data is teal, Software & Cloud Terms is slate).
  - John accepted the visual connection as working.

## Known limits and pitfalls (checked 14 Oct)
- **Panels that need an authenticator are blank to the viewer.** On Work Board, the Master task list shows "Two-step verification is required" in the picture, because the read-only viewer account cannot pass an authenticator check.
- **The Brain room capture failed once** (run 38505474093, 03:17 UTC). The browser was ready, then the capture step exited 1. The service only reports "The capture failed", and the cause is not yet known.
- **Every authenticator code John enters signs out older assistant sessions.** That is Supabase's rule: sessions below aal2 are deleted on MFA verification. Reconnecting one assistant can sign the other out.
- **ChatGPT (14 Oct, diagnosis only, not fixed).** ChatGPT showed only 10 tools, and its logs showed HTTP 401 `authorization_required`. office-mcp checks auth before `tools/list` (`src/lib/office-mcp.ts:63-64`) and returns the same list to every client (`:88`), so ChatGPT is showing a stale cached list. The likely cause is a session wiped by an authenticator code. Still unknown: whether ChatGPT has its own viewing grant (`canx_private.office_view_grants`, assistant `chatgpt`).
- **Brain notes written through `write_office_record`** are rejected (opaque HTTP 400) when the detail is long or multi-paragraph. About 1.1 KB in a single paragraph saves fine.
- **From Claude's environment:** PRs cannot be merged (John merges), git tags cannot be pushed, and Actions log downloads are blocked. Run and step status and `::notice::` annotations can be read through the GitHub API.

## How we got here (path, 14 Oct 2026 UTC)
1. **01:38** First live test. `read_room_information` worked. `view_room` timed out at the assistant's 60 s limit, but both capture runs succeeded (~100 s each). Cause: the picture arrived after the assistant had stopped waiting.
2. **01:48** PR #98: use the runner's Chrome and wait 45 s / 55 s. John merged at 02:02. The next run still took ~85 s.
3. **02:06** PR #99: `view_room` returns `pending` + `requestId`, and a second call collects the same picture. It also adds timing notices. John merged at 02:12.
4. **02:12–02:21** John replaced `office-mcp` and `office-view` in Supabase with bundles built from `ad069a1`.
5. **02:22** The first picture reached an assistant (Reception), followed by Legal at 02:26 and Work Board at 03:20.
6. **20:28** The evening acceptance test (above) passed.

## If it breaks: get back to this state
1. **Office connector:** `view_room` should return `pending` then an image. If `view_room` does not appear, or calls fail with an auth error, reconnect the assistant's connector. Enter the authenticator code in the Office first, in the same browser.
2. **Deployed functions:** each deployed function should match the SHA-256 above. If not, rebuild from `ad069a1` and redeploy (steps above).
3. **Capture runs:** check them with `gh api repos/canericaextreme/canx-office/actions/workflows/office-view-capture.yml/runs`, which shows status, step timings and `Capture timing` notices.
4. **Viewing grant:** if a picture call says permission is off, re-authorise the grant under Build & Testing → Assistant viewing access.
