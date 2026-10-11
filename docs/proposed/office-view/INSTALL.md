# Installing the Office view service (PROPOSED — needs John's approval first)

Nothing here is installed. Order matters; each step lists how to undo it.

1. **Database** — run `docs/proposed/office-view-delegation.sql` (adds 4 private tables, SELECT-only `office_view_read` policies, owner controls, private bucket `office-captures`). Undo: drop the objects it creates (`office_view_*`, policies named `office_view_read`).
2. **Viewer accounts** — create three non-owner accounts (Claude, ChatGPT, Elsie) in Supabase Auth. They get no role and no password anyone knows. Write down only their user ids.
3. **One authenticator check by John** — signed in as owner at AAL2, call `canx_view_grant_set` once per assistant with the rooms and scopes John chooses. Undo: `canx_view_grant_revoke` (works at AAL1).
4. **Edge function** — copy `office-view/index.ts` to `supabase/functions/office-view/index.ts`; secrets: `CANX_VIEW_DISPATCH_TOKEN` (fine-grained GitHub token, **Actions: write on this one repo only**, 90-day expiry). Undo: delete the function and the token.
5. **Workflow** — copy `office-view-capture.yml` to `.github/workflows/`; repository variable `CANX_VIEW_BROKER_URL` = `https://<project>.supabase.co/functions/v1/office-view`. Must reach `main`; the broker refuses any other branch or file. Undo: delete the file.
6. **Connector tools** — already in the code (`office-mcp-view.ts`), off by default. Turn on by setting the connector function's secret `CANX_VIEW_SERVICE_URL` to the `office-view` function address. Unset = the tools do not exist. Regenerate the tour/brief snapshot with `CANX_UPDATE_BRIEFS=1 bunx vitest run src/lib/room-briefs-snapshot.test.ts` when rooms or skills change.
7. **Retention** — schedule `canx_view_capture_purge()` (24 h retention).

## Cost
No new paid service. GitHub Actions minutes: roughly 1–2 per capture (public repo: free). Supabase storage: PNGs ≤3 MB, deleted after 24 h. Function invocations: negligible.

## Known limits (do not claim otherwise)
- `read_room_information` returns only the requested room's rows (database function `canx_view_room_information`, run as the viewer, so row-level security still applies). Device-only data is never included.
- A capture takes roughly 30–90 s (workflow start-up), so the first answer is not instant.
- Elsie's path relies on John's signed-in session for her conversation.
- Nothing here has run live. Fixture and stand-in success is not live verification.
