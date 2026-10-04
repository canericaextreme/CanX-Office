# Subscriptions: Elsie routine review pass

## Build
- Add a deterministic, conservative eligibility classifier for saved Subscriptions evidence. It will review only trustworthy, unambiguous routine items and retain source-specific reasons.
- Keep failed payments, unresolved invoices, conflicts, unknown or unverified senders, missing required values, unreadable evidence, and ambiguous deadlines for John.
- Extend the existing owner/MFA-protected, compare-and-swap save path with one verified batch operation. Preserve dismissed/reviewed/ignored decisions and add compatible review provenance without changing the database.
- Add a compact **Elsie review** action to Subscriptions with a verified summary: newly reviewed, already reviewed, and left for John.
- Route explicit typed and live-voice review commands through the same authenticated operation; questions, negations, and hypotheticals remain read-only.

## Technical details
- Re-read after save and count only exact IDs carrying the deterministic review provenance; partial or failed verification will not claim completion.
- Review state will explicitly not mean paid, filed in Finance, current, or owner-confirmed.
- Cover a mixed 120-item fixture, idempotency, save/readback failure, conflicts/currency/missing history, preserved dismissed decisions, and command routing.

## Verification
- Run focused tests, the full test suite, TypeScript checking, and confirm the preview build status.
- Do not run the review against John's data, call Gmail or paid services, migrate data, or publish.
