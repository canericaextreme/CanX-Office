# Office Manager activation readiness — read-only review

Commit inspected: `ac0246c` ("Fixed Claude & database status"), the approved recovery baseline. No code, secrets, data or provider calls were touched.

## 1. Is the server path built, and what invokes it

Yes, it is fully built.

- `src/lib/manager.functions.ts` — server functions `getManagerStatus` and `managerChat` (bottom of file), wrapping the testable `computeManagerStatusWith()` and `runManagerChatWith()`.
- `src/components/office/OfficeManager.tsx` — the manager dock; `useServerFn(managerChat)` at line 47, sent by `send()` (line 138) from the "Send" button (line 338).
- Mounted for every office page in `src/routes/_office.tsx` (line 26), so it appears on all 20 destinations, not one page.

## 2. Required settings (presence only, no values shown)

| Name | Purpose | Present |
| --- | --- | --- |
| `OPENAI_API_KEY` | CanX-owned AI key | absent |
| `OPENAI_MODEL` | model, must be chosen deliberately | absent |
| `CANX_SUPABASE_URL` | CanX-owned database | present |
| `CANX_SUPABASE_PUBLISHABLE_KEY` | database sign-in | present |

`ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are present but belong to Claude, not the manager. The manager reads its two names in `realDeps()` and never guesses a model.

## 3. Gates before any paid call

All present in `runManagerChatWith()`, in this order, all server-side:

1. Owner identity, role and two-step verification — `deps.verifyOwner()` → `verifyOwnerWith()` in `canx-backend.server.ts`; `aal !== "aal2"` denies (`mfa_required`, line 114). Role is read from the database, not the browser.
2. Input validation — `validate()`: max 20 messages, 6000 characters each, token truncated to 4000, roles filtered.
3. Key and explicit model both required.
4. Durable reservation — `reserve_ai_call` RPC; refusal reasons `unavailable`, `rate_limit`, `budget_limit`.
5. Live authenticated health check every call (`GET /v1/models/{model}`, 15s timeout).
6. Request timeout 45s; output capped at 900 tokens; upstream bodies and status details never returned to the browser (`sanitizedProviderDetail`); every failure settles the reservation as `failed`.

Fail-closed throughout: any failed step returns a deny reply and makes no upstream request.

## 4. Is the C$500 ceiling enforced

No — displayed only, and honestly labelled as such.

- `src/lib/office-budget.ts` is a written record; `budgetView()` returns `enforcement: "unverified"`.
- `BudgetPanel.tsx` states "Status: not enforced."
- Real enforcement lives in `docs/migrations/0002_ai_limits.sql` (`ai_limits` defaults: 6 calls/minute, 200/day, 500 cents/day, 5000 cents/month) — **status marked NOT APPLIED**. With no `ai_limits` row, `reserve_ai_call` returns `unavailable` and the manager denies. That is the intended behaviour.
- Note: the migration's monthly default is 5000 cents = $50/month, not $500. The two numbers are unrelated today and must be reconciled deliberately before activation.

## 5. Smallest safe activation sequence

No code changes are required. Order matters — the last step is the only one that can cost money.

1. Confirm `0001`/`0002` migrations are actually applied in the CanX-owned database, and that an `ai_limits` row exists for John's owner account with the monthly cents figure he intends.
2. Sign in as owner with two-step verification and confirm the manager reads `not_configured` (that proves gates 1 and 5 pass before any key exists).
3. Choose the exact OpenAI model name deliberately and add `OPENAI_MODEL` in Project Settings → Secrets.
4. Add `OPENAI_API_KEY` in Project Settings → Secrets.
5. Reload, check status turns to verified, then send one short message and confirm one reserved-and-settled usage row appears.

Optional, only if wanted: apply to the manager the same two fixes already made for Claude — a bound `fetch` wrapper and trim/empty-normalisation of the two settings in `realDeps()`. The manager currently uses a detached `fetchImpl: fetch` and untrimmed values, the exact pattern that produced Claude's unreachable state.

## 6. Tests and gaps

Covered in `src/lib/manager.functions.test.ts` (17 cases): all seven deny reasons with no upstream fetch, key-alone never connects, missing key/model, `unavailable`/`rate_limit`/`budget_limit`, failed health check releasing the reservation, no upstream body leakage, the successful path, verified status only after a passing health check, and tool-argument clamping.

Gaps: no test for the bound-fetch/trimming behaviour of `realDeps()`, no test asserting the 20-message / 6000-character truncation, no test for the untrusted-context fencing, and no end-to-end test that the C$500 written ceiling matches the database limit.

## Baseline

Recovery baseline `ac0246c` is unchanged. Nothing in this review altered code, secrets, database or deployment.
