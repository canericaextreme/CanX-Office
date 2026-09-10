# Office Manager: truthful, server-built context

The Manager is live and answering, but it is being fed the old Phase 1 demonstration
records plus a boundary line that wrongly says no database is connected. This repair
makes the Manager read the real, owner-verified office on the server, and stops the
browser from supplying office facts at all.

No visual change: appearance, layout, routes, Brain, Finance screen, receipts,
sign-in, and Systems screen stay exactly as approved. No database schema change, no
secret change, no data change.

## What changes in behaviour

- The Manager's knowledge of the office is assembled on the server, only after the
  existing owner + two-step verification passes.
- Anything the browser sends as "office context" is ignored.
- The context states verified facts: database connected, owner confirmed, two-step
  verification confirmed, and the exact provider and model configured.
- Shared notes, tasks and decisions come from the real shared office records.
- Round table: whether a saved record exists, and its last update if the record
  carries one.
- Finance: counts only — receipts filed, source messages, needing review, reconciled,
  and totals grouped by each receipt's own original currency. No vendor, no individual
  amount, no order number, no email text, no link, no message id, no raw document.
- Projects and work items: there is no authoritative table for these, so the Manager
  is told none are recorded. The old sample projects and work items are not sent.
- If a required live read fails, the Manager refuses with a plain message. It never
  quietly falls back to the old demonstration data.
- The non-AI "Office briefing" line that claims "no live connections" is corrected to
  reflect actual verified state. Same place on screen, same styling, only the wording
  and the facts behind it change.

Existing health check and the durable spending/rate reservation stay exactly as they
are, and still run before any paid call.

## Technical notes

New server-only module `src/lib/office-live-context.server.ts`:
- `buildLiveOfficeContext(config, token, { model, provider })` runs after
  `verifyOwnerWith` succeeds, and uses `restRequest` from
  `src/lib/canx-backend.server.ts` so RLS applies as the signed-in owner.
- Reads `office_notes` (select, ordered), `round_tables` (existence + last update),
  and `finance_receipts?select=doc` for the owner.
- Receipts are reduced to aggregate counters and per-currency totals inside this
  module. The raw `doc` never leaves it; the returned type has no free-text fields.
- Any non-ok REST response or thrown error returns a typed failure, not partial data.

`src/lib/manager.functions.ts`:
- `ManagerDeps` gains `buildContext(token)`; `realDeps()` wires the module above.
- `runManagerChatWith` builds context after gate 1 (owner verified) and before the
  budget reservation; a context failure returns a new fail-closed code
  (`context_unavailable`) with a plain message and makes no paid call.
- `validate()` drops the client `context` field; `ChatInput` no longer carries it.
- `untrustedContextMessage` keeps the fenced untrusted-data wrapper around the
  server-built text, so provider output is still treated as data.

`src/lib/office-context.ts`:
- Keep the module for the non-AI briefing only. `localBriefing` takes the verified
  connection state and reports it truthfully; the false "no backend is connected"
  boundary line is removed. Sample-derived lines are either dropped from the live
  briefing or kept explicitly labelled sample.

`src/components/office/OfficeManager.tsx`:
- Stops passing `context` to `managerChat`; keeps notes UI, tabs, and layout intact.
- Briefing call updated for the new signature.

Tests (`src/lib/office-live-context.test.ts`, plus additions to
`src/lib/manager.functions.test.ts`), all offline with stub fetch:
- verified live context includes model, owner/MFA verified, notes, round table state;
- empty live state reports "none recorded" rather than sample data;
- failed read returns `context_unavailable` and no provider request is made;
- receipt aggregation counts and per-currency totals are correct and never mix
  currencies;
- privacy: given receipts containing vendor, amount, order number, email body, URL and
  message id, none of those strings appear anywhere in the provider request body.

Then run typecheck, the full test suite, and the production build. No deployment.

## Files expected to change

- `src/lib/office-live-context.server.ts` (new)
- `src/lib/office-live-context.test.ts` (new)
- `src/lib/manager.functions.ts`
- `src/lib/manager.functions.test.ts`
- `src/lib/office-context.ts`
- `src/components/office/OfficeManager.tsx`

Not touched: Reception, Brain, Finance screen, receipts storage, Systems, sign-in,
Supabase schema/RLS, migrations, secrets, budgets, Claude, deployment. Baseline
`ac0246c` and current commit `faf8c1c` remain recoverable.
