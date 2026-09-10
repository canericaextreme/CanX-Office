# Claude connection: diagnose the "could not reach Anthropic" result

Diagnosis and plan only. No code changes, no deployment, no paid calls.

## What we actually know

Confirmed by reading the code and the live status you reported:

- The office reaches your own CanX database from the same server runtime: owner sign-in, owner role and two-step verification all succeed there. So the server is not cut off from the internet in general.
- The Claude check never received any answer from Anthropic — both the single-model lookup and the model-list fallback failed before any reply arrived, and not by timeout (the message would have said so).
- Anthropic itself is reachable and answering from outside the app (a plain unauthenticated request returns a normal "unauthorised" reply in about 0.2 seconds), so the service is up.

Not yet confirmed, and the plan's first step is to confirm it: whether the failure is the app's own server being blocked from that particular address, or something in how the request is formed (for example a model name with unexpected characters in the address).

## Answers to your five questions

1. **Outbound access.** The app's server code can make outbound requests — it already does, to your database. Whether that extends to `api.anthropic.com` is not something the code can tell us; it has to be measured. Preview and published are different runtimes with separately applied settings, so a result in one does not prove the other. Both need checking.
2. **Telling the causes apart safely.** Yes. The failure category (name lookup, secure-connection failure, blocked/refused, timeout) can be recorded from the error's own type and name, with the elapsed time, without ever touching the key, the request headers, or the provider's response body. That is a small, safe addition.
3. **Moving the calls into your own database's edge function.** Recommended only if step 1 shows the app's server genuinely cannot reach Anthropic. It is the durable fix in that case: the call would run inside your own CanX-owned infrastructure, the key would live there and never in the app, and all the existing gates stay in force. But it is a larger change and pointless if the real cause is a malformed address, so it is the fallback, not the first move.
4. **Publishing.** Publishing alone is worth testing before any rewrite: settings you add are applied to the live site at publish time, and the live site runs on different infrastructure than the preview. It can be tested for free — the connection check only asks Anthropic to describe a model, which is not a billable request. It never sends anything to the paid review endpoint.

## Recommended path — measure first, one small safe change

**Step 1 — add non-secret failure detail (small change to one file plus its tests).**
In the Claude check, record and display the failure category and how long it took: name-lookup failure, secure-connection failure, connection refused/blocked, timeout, or other. Also show the exact address shape being used (host and path only, no key, no headers, no provider body). Nothing secret is added to the display, and no extra request is made.

**Step 2 — you refresh the Systems page as owner.** The row now says which of the four it is.

**Step 3 — act on what it says.**
- Blocked/refused → the app's server cannot reach Anthropic. Go to the fallback below.
- Name-lookup or secure-connection failure → likely the same conclusion; confirm by publishing and re-checking on the live site.
- Something about the address or model name → fix the model value in settings; no architecture change needed.
- It works on the live site but not preview → nothing to fix; the check is honest, preview simply cannot reach it.

Throughout: no paid review call, no change to owner rules, budgets, Finance data, or any other room.

## Fallback path — move the Anthropic calls into your own database's edge function

Only if step 3 shows the app's server is genuinely blocked.

Shape of it:

- One new edge function in your CanX-owned Supabase project with two actions: `health` (free model lookup) and `review` (the paid review).
- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` move to that project's own secret storage and are removed from the app. The browser never sees either, before or after.
- The function requires the caller's signed-in token, re-reads the owner role from your database, requires two-step verification, and reserves budget through the existing durable reservation before any paid call. Same order, same fail-closed behaviour as today.
- Cross-site access restricted to the office's own addresses only.
- The app's existing Claude code keeps its shape; only the address it calls changes, so the panel, Systems row, and activity records stay as they are.
- Tests: success, refused credentials, unknown model, rate limited, provider failure, timeout, blocked network, and a check that no secret ever appears in any returned message.
- Manual steps for you: add the two secrets in your database project, deploy the function, remove the two secrets from the app, refresh Systems.
- Rollback: point the app back at the direct path and re-add the app secrets. No data is migrated, so nothing is lost either way.

## Technical notes

- Failure classification uses the thrown error's `name`/`cause` only; the key, headers, and provider bodies stay out of logs and out of anything returned to the browser.
- The health probe uses `GET /v1/models/{id}` with `GET /v1/models?limit=100` as fallback; neither is billable. `/v1/messages` is untouched by verification.
- Files touched in step 1: `src/lib/claude-review.functions.ts`, `src/lib/claude-review.test.ts`, and the Systems row wording only if the detail needs a place to render.
