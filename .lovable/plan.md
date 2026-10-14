# ChatGPT viewing tools — separating saved conversation tools from a server that leaves them out

Diagnosis only. No code, redeploy, publish, reconnect or second refresh.

## What we know
- The server's tool list is either 10 tools (no viewing connection) or 15 tools (viewing connection set up). There is no other result (`src/lib/office-mcp.ts` line 88).
- The viewing connection is skipped only if the server's `SUPABASE_URL` fails the strict address check in `supabase/functions/office-mcp/index.ts`. That check runs once, when the service starts.
- After Refresh, the current conversation still shows 10 tools. A conversation can keep the tools it started with, so this does not prove the server left them out.
- An HTTP 200 in the log only shows that a reply was sent. It doesn't show which tools the reply contained.

## Evidence that tells the two causes apart (in order)

1. **Fresh conversation check (no refresh, no reconnect).** John opens a brand-new ChatGPT chat, chooses the new CanX Office link, and asks it to list the tool names.
   - 15 tools: the old conversation kept its tool list. The server is fine.
   - 10 tools: continue to step 2.

2. **Was the tool list actually requested? (Supabase logs, read-only.)** Check office-mcp edge logs for 01:55–01:58 UTC (the refresh) and for the time the new chat opened.
   - Look for a POST to `/functions/v1/office-mcp` from the OpenAI connector, with its status.
   - No POST: ChatGPT reused its saved list and never asked the server. Server omission is not shown.
   - POST with 200: the server was asked, but the reply body isn't in these logs. Continue to step 3.

3. **What the server reply actually contained.** We can get this directly, with no deploy, in one of two ways:
   - a. Using ChatGPT's own signed-in connection, call a **tool that doesn't exist** (for example `view_room`) on the new link. If the server has viewing set up, it runs the view handler, so the reply is a viewing-permission or room result. If it doesn't, the reply is "Unknown tool". This shows what the live service does, whatever list ChatGPT has cached.
   - b. Alternatively, ChatGPT's Supabase tools read office-mcp's environment *shape* (not its value): whether `SUPABASE_URL` exists, its length, any trailing `/`, any capital letters. No secret is revealed.

## How to read the results

```text
Fresh chat 15 tools                 -> conversation cache; nothing to fix
view_room runs (permission/result)  -> server offers view; ChatGPT inventory is stale
view_room "Unknown tool"            -> server omission; address check is the cause
```

## If server omission is proven (proposal only, needs separate approval)
- Normalise the address before the existing strict check: remove one trailing slash, lowercase the host. Accept no other addresses.
- Add a regression test, then redeploy office-mcp with John's approval.

## Not touched
- Claude's PR98 capture-timing files.
- Room permissions, the authenticator step, credentials, AI Gateway, budgets, the old Primary link.

## Status
- ChatGPT: reads records; viewing tools not shown. The cause isn't proven yet.
- Claude: owns the timing work.
- Elsie: not affected.
