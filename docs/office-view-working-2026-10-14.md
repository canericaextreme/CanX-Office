# Room pictures: working version and deployment steps (14 Oct 2026)

## What is proven live
On 14 Oct 2026, Claude's claude.ai "canx office" connector received real, fresh pictures of two Office rooms:

| Room | Captured (UTC) | Image SHA-256 | Office build |
|---|---|---|---|
| Reception `/reception` (run 38500585213) | 02:22:30 | `92dbc12ba7c43f5bf686a51d2a62034defe7a099018f4c471a9d2232dbedc898` | `index-BkcfyTdi.js` |
| Legal `/legal` (run 38500906927) | 02:26:22 | `4508eb24895d4b860e62b67ae1348c7578cfd279e1159ea0a4c5c19b38fafcdf` | `index-BkcfyTdi.js` |

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
