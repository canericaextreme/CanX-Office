# Finance category navigation and scoped email commands

## Scope
- Turn the four existing Finance summary cards into accessible navigation for Income, Expenses, Receipts, and Tax prep.
- Keep the Finance hub compact; opening a card replaces the hub with that section near the top and provides a clear Back to Finance control.
- Reuse the current receipt import, receipt editing, totals, reconciliation, and budget displays. Receipt rows open their existing saved details; empty Finance sections state exactly what is unavailable or not recorded.
- Preserve owner sign-in, two-step verification, current storage and save behavior, and every existing financial record.
- Add restrained green, teal, and navy Finance accents using shared design tokens.

## Email command routing
- Recognize only the explicit short commands “check my email”, “check the emails”, “check both mailboxes”, and “can you check my email”, including harmless punctuation or an Elsie/Astra prefix.
- Route them through the existing authenticated receipt/subscription email check used by the button.
- Keep status questions, negated requests, hypothetical/discussion wording, long or multi-step requests out of ingestion.
- Keep the result explicit that this is a bounded billing/renewal/service-sender check, with each mailbox result and complete/partial/failed state; it is never described as the whole inbox.
- Update concise live-voice guidance without exceeding the existing byte budget.

## Verification
- Add interaction tests for every Finance card by mouse and keyboard, populated and empty sections, receipt-detail opening, and Back to Finance.
- Add positive and negative email-intent tests plus manager pre-route and voice-guidance regressions.
- Run focused tests, the full test suite, TypeScript checking, and a production build for preview validation.
- Do not run Gmail, call paid AI, alter financial data, change the schema, impersonate the owner, or publish.
