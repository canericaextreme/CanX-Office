# ChatGPT viewing tools missing — diagnosis and next step

## Confirmed (code + your deployed-source evidence)
- The tool list is built in one line (`src/lib/office-mcp.ts` line 88): base plan tool + `get_office_status` + 8 work tools + the 5 viewing tools only when `deps.view` exists.
- Without viewing tools that is exactly 1 + 1 + 8 = **10 tools** — the same ten ChatGPT shows. So ChatGPT is showing either (a) a tool list it saved earlier, or (b) a fresh list from a server where `deps.view` was missing at runtime.
- `deps.view` is missing only if `SUPABASE_URL` on the host does not match `https://<20 lowercase letters/digits>.supabase.co` exactly (for example a trailing slash, capital letters, or an internal address). The project ref `gmsjjiprtulxojhkmbqb` is 20 characters, so the normal value should match.
- No code change is justified yet: neither cause is proven.

## Unknown
- Whether ChatGPT has asked the server for the tool list again since the new assistant link was made.
- The real runtime value shape of `SUPABASE_URL` inside office-mcp (not readable from source).

## Step 1 — one owner action (no code, no deploy)
In ChatGPT: Settings → Apps & Connectors → CanX Office (the new assistant link, not Primary) → use **Refresh** (in developer mode the connector page has a refresh-actions control). Do not disconnect or reconnect. Then start a new chat and ask ChatGPT to list the CanX Office tools.
- 15 tools appear → cause was ChatGPT's saved list. Nothing to fix. Go to the room-picture test (Claude's timeout work stays separate).
- Still 10 → go to Step 2.

## Step 2 — only if still 10 (direct, read-only)
ChatGPT (with its Supabase tools) reads office-mcp edge logs for that refresh and confirms a `tools/list` POST arrived with HTTP 200. If it arrived, the server itself is omitting viewing tools, which points to the `SUPABASE_URL` match.

## Step 3 — minimal reversible fix, only if Step 2 points there
- In `supabase/functions/office-mcp/index.ts`, normalise the URL before the check (trim one trailing slash, lowercase the host) while keeping the same strict pattern — no wider address accepted, no new secret, no permission change.
- Add a test: trailing-slash and uppercase URLs still offer the 5 viewing tools; any other host still offers none.
- Run tests, then you approve an office-mcp redeploy (separate from publishing the website), then refresh the connector once more.

## Not touched
Claude's 60-second picture timeout code, room grants, MFA, credentials, AI Gateway, budgets, the old Primary link.

## Status
- ChatGPT: reads records; viewing tools not exposed; cause narrowed to saved list vs runtime URL check.
- Claude: picture timeout handled by John with native Claude.
- Elsie: not affected.
