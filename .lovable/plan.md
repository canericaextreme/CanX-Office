# Diagnosis: ChatGPT "get_office_status" returned MCP -32603 (read-only findings)

## Two separate things
- **New diagnostic box (Systems room):** this runs only in the browser, uses rules only and is preview only. It plays no part in ChatGPT's connection and can't cause or fix this error.
- **Live connection repair (consent redirect):** this fixes the reconnect approval page on the published office website. It's a different path from the one ChatGPT just used.

## Confirmed from the code (no live logs read)
1. ChatGPT's office tools don't run on the published website. They run in a separate service, `office-mcp`, on CanX's own database host. **Publishing the website doesn't update or restart that service.** So John's publish can't have changed this result, for better or worse.
2. The `office-mcp` code never sends error -32603. For sign-in problems it sends "authorization required" (HTTP 401). When the status read fails, it sends a normal reply with the text "Saved Office records could not be read". So -32603 most likely came from outside the office code. Possible sources: ChatGPT's own connector layer, the host failing to start or reach the service, or a reply ChatGPT couldn't understand.
3. `office-mcp` still uses the "fail on redirect" setting. That setting works on its host (Deno), so it isn't the website bug and isn't a confirmed cause here.
4. The reconnect page bug (fixed by the published repair) came before this. If ChatGPT's earlier reconnect never finished, it may still be holding an old or incomplete sign-in.

## Unknown (no evidence available to me)
- Whether `office-mcp` is deployed and starting up. ChatGPT says it is, but I can't see that host's logs from here.
- Whether the request reached `office-mcp` at all, and what HTTP status came back.
- Whether ChatGPT's stored sign-in is current, expired, or left over from a failed reconnect.
- Whether the published website actually includes the redirect repair. It hasn't been checked live.

## Smallest next step (needs John; no edits from me)
1. In the CanX database host's dashboard, open **Edge Functions → office-mcp → Logs** for about 01:20 UTC. Note whether a request came in, its status, and any startup error. Don't copy any tokens.
2. If there's no request or a startup error, the service needs redeploying on that host. That's separate from publishing the website.
3. If the request shows a 401, do **one** reconnect from ChatGPT. The published repair should now show the Approve button. Approve with your authenticator.
4. Then ask ChatGPT for, in this order: office status, one saved room read, one room picture. Report each result separately. The connection is "working" only after all three succeed.

## Assistant status
- **ChatGPT:** Not working. Last result was -32603, cause unconfirmed.
- **Claude:** Not tested in this session. Its build-status checks worked earlier; I have no evidence about its room reads or pictures.
- **Elsie:** Not affected. She doesn't use the ChatGPT connector.

## Technical details
- Handler: `src/lib/office-mcp.ts`. Errors come from the error codes -32700, -32602 and -32601 plus a tool-level `isError`; -32603 is never produced.
- Service entry: `supabase/functions/office-mcp/index.ts`. The status read calls `rpc/canx_mcp_office_status` with an 8-second timeout.
- Possible later code fix (not proposed for now): wrap the top-level handler so unexpected failures return a labelled, redacted error. That would make the next failure diagnosable.
