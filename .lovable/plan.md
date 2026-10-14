# ChatGPT connection diagnosis — findings and reconnect plan

No code changes, no publishing, no credential or permission changes. This plan records the confirmed diagnosis and the owner-led verification sequence.

## Confirmed facts (from John's verified Supabase evidence, 2026-10-14 01:18–01:24 UTC)

- CanX Office project `gmsjjiprtulxojhkmbqb` is ACTIVE_HEALTHY.
- office-mcp v16, office-consent v1, office-view v3 are all listed ACTIVE.
- At 01:20:26 an OpenAI connector POST to `/auth/v1/oauth/token` returned HTTP 400.
- Auth logs at the same time: `refresh_token_not_found` — "400: Invalid Refresh Token: Refresh Token Not Found".
- No office-mcp or office-consent edge requests in that window.

## Diagnosis

ChatGPT's connector holds a stale sign-in whose refresh token no longer exists in the auth service. The connector tried to refresh it, the refresh failed with HTTP 400, and the request never reached any office tool handler — consistent with the empty office-mcp/office-consent logs and with the earlier generic MCP -32603 "Internal error" surfaced to ChatGPT.

This explains the failure up to the token refresh. It does not prove anything further (for example, why the refresh token is absent — most likely the interrupted earlier reconnect left a partial sign-in, but that is not proven).

## What this rules out

- Not an expired API key.
- Not a stopped database or undeployed service — all three functions are ACTIVE.
- Not the website consent-page redirect bug reaching the handler — the request never got that far. The published redirect repair is still required for the reconnect to succeed, but it is not the cause of this 01:20 failure.
- No redeploy of office-mcp is justified by this evidence.

## Next steps (owner-led, no code changes)

1. John reconnects once from ChatGPT: Plugins → CanX Office → Manage → Connected Accounts → Reconnect → Continue to CanX Office.
2. The consent page (with the published redirect repair) should now show the Approve button instead of "Isolated Office sign-in is unavailable." Approve with the authenticator step.
3. ChatGPT then runs, reporting each result separately:
   - `get_office_status` — expect a real status reply, not -32603.
   - One saved room read.
   - One room picture.
4. The connection is only called working once all three succeed.

## If the reconnect still fails

- Capture the exact displayed message and the auth/edge log entries for the new timestamp window, and report them back. Do not retry repeatedly.

## Status by assistant

- ChatGPT: not working — stale sign-in confirmed; awaiting one reconnect and the three tests above.
- Claude: not tested this session; build checks worked earlier; no evidence for room reads or pictures.
- Elsie: not affected.
