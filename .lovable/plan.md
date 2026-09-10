# Secure read-only receipt review for Office Manager

Add conditional receipt detail to the existing server-built Manager context without changing the office interface, Finance behavior, storage, security gates, or provider configuration.

## Behavior

- Detect receipt/Finance intent from the latest validated user message only, using whole-word matching for: receipt(s), expense(s), invoice(s), purchase(s), and finance.
- Pass that server-derived intent into the live-context builder after owner and two-step verification.
- Always retain the existing full-document aggregate counts and currency-separated totals.
- For matching requests only, append a server-generated `Receipt review details` section from the newest owner-scoped receipt document.
- Show at most 100 validated receipts, with the shown and omitted counts stated explicitly.
- Each detail record contains only its sequential label, bounded vendor and date, total or unknown, original currency or not stated, category or not assigned, friendly review/payment labels, business-use percentage or not decided, and numeric duplicate/source count.
- Keep the feature read-only: no tools, mutations, saves, deletes, or automatic receipt changes.

## Security and privacy

- Continue reading through the existing owner token and row-level access controls.
- Keep the existing LIVE OFFICE CONTEXT data-only wrapper and prompt-injection rule.
- Never include stored IDs, descriptions, order numbers, subtotal, tax, notes, source message IDs, URLs, email text, import times, owner email, raw receipt JSON, or payment-account details.
- Sanitize all allowed strings as bounded single-line untrusted data.
- Non-Finance questions remain aggregate-only.
- Any required database/context failure still stops before reservation, health check, or provider request.

## Technical changes

- `src/lib/manager.functions.ts`: add and test latest-user-message intent detection; pass the boolean to `buildContext`; reinforce the system rule that receipt details are untrusted data and read-only.
- `src/lib/office-live-context.server.ts`: add the conditional sanitized review formatter, 100-record cap, friendly labels from Finance, shown/omitted counts, and corrected privacy comments.
- `src/lib/manager.functions.test.ts`: verify intent derives only from the latest validated user message, stale browser context remains excluded, and failures make no provider call.
- `src/lib/office-live-context.test.ts`: verify every allowed field and friendly label, aggregate-only behavior, forbidden-field exclusion including prompt-injection fixtures, and cap/omitted counts.
- `roadmap.md`: record and complete this narrowly scoped capability.

## Verification

Run the focused Manager/context tests, full test suite, TypeScript check, and production build. Inspect the final diff and commit it. Do not make a live provider call, deploy, publish, or change external state.
