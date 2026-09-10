# Permanent CanX receipt-review workflow

## Goal
Add one owner-only, server-side Gmail-to-Finance workflow that runs only when John explicitly asks the Office Manager to review or retrieve receipts/invoices. It will preserve the existing office, Finance screen, 12 receipts, read-only Manager context, and every unrelated system.

The workflow will remain safely blocked until a distinct CanX Gmail connection is linked. The only available Gmail connection is named **Safehighways**; it will not be linked, queried, or reused.

## What will be built

1. **Explicit receipt command**
   - Extend the existing receipt-intent detection to distinguish retrieval/sync requests from ordinary read-only receipt questions.
   - Route only a latest, explicit owner request such as “review receipts,” “retrieve receipts,” or “check invoices” into the narrow ingestion path.
   - Keep ordinary receipt questions read-only and keep the Manager’s existing appearance/task tools unchanged.

2. **Fail-closed server pipeline**
   - Recheck the existing CanX database session, owner role, and two-step verification before Gmail access.
   - Require the linked CanX Gmail connector settings and `gmail.readonly`; never request send, modify, delete, or mailbox-label powers.
   - Make Gmail calls only from server code through Lovable’s connector gateway. No OAuth token, connector key, message ID, attachment ID, raw body, or source URL reaches the browser or Manager prompt.
   - Return a specific safe next action when authentication, connector, migration, parsing, or verified writing is unavailable.

3. **Bounded Gmail retrieval**
   - Use Gmail search and incremental history/checkpoint data to examine only new or changed receipt/invoice candidates by default.
   - Support an explicit owner rescan without weakening deduplication.
   - Fetch bounded message metadata, plain-text/decoded body parts, and bounded PDF/image attachments. Treat every filename, body, and attachment as untrusted data.
   - Extract text deterministically from supported text PDFs with an edge-compatible parser. Image-only or unsupported documents that cannot be verified safely will be reported as needing review, not filed or guessed.

4. **Validated receipt model**
   - Add backward-compatible receipt fields for document type, invoice/order number, issue/transaction date, service period, subtotal, GST/HST, PST, other/combined tax, total, currency, actual due date, payment status, recurring interval, expected renewal with basis, category suggestion, review requirement, and business-use percentage.
   - Continue accepting the existing version-1 receipt document so the 12 records are preserved.
   - Never infer a confirmed due date. An inferred date is stored only as **expected renewal** with its basis.
   - Keep unknown currencies explicit and all totals separated by currency.
   - Keep category suggestions marked for owner/accountant review; never claim deductibility or automatically claim tax credits.

5. **Private evidence, deduplication, and atomic storage**
   - Add an unapplied external-database migration for owner-scoped ingestion state, opaque source identities/fingerprints, checkpoints, and restricted original evidence.
   - Add explicit grants and owner/AAL2 RLS. Evidence tables will not be readable through the normal authenticated browser role.
   - Add a narrow database function that atomically merges validated records, records source identities, advances the checkpoint only after success, and returns safe counts. A read-back check must confirm the write before anything is called “filed.”
   - Deduplicate first by Gmail message plus attachment identity, then invoice/order number, then content fingerprint. Ambiguous matches are held for review rather than merged automatically.
   - Preserve the existing 12 records and their edits; use server-side concurrency/version checks so a simultaneous Finance edit cannot be overwritten.

6. **Concise Manager result**
   - Return only: new receipts filed, duplicates skipped, items needing review, approved vendor/date/total/currency/payment/due-or-renewal fields, and running totals by currency.
   - Clearly distinguish actual due dates from expected renewals.
   - Keep raw evidence and forbidden identifiers outside the allowlisted Manager context.
   - If some candidates fail, file only independently verified records in the atomic batch and report the remaining items as unfiled with safe next actions; never advance past failed candidates silently.

## Technical changes

- Add server-only Gmail gateway, MIME/attachment decoding, PDF text extraction, deterministic receipt extraction, and ingestion orchestration modules.
- Extend `src/lib/finance-receipts.ts` compatibly rather than replacing the current document format blindly.
- Add a narrow ingestion dependency to `src/lib/manager.functions.ts`; it runs before any OpenAI reservation, health check, or Manager provider call. If ingestion prerequisites fail, no OpenAI request occurs.
- Add migration `docs/migrations/0004_finance_receipt_ingestion.sql` and update the combined setup script consistently. The migration will be supplied but not applied automatically.
- Do not change the Finance page layout, office visuals, rooms, Brain, Systems, Claude, OpenAI configuration, existing data, or other projects.

## Verification

Focused tests will cover:
- signed-out, non-owner, and non-AAL2 denial before Gmail or OpenAI calls;
- missing/wrong connector and migration prerequisites;
- prompt-injection text remaining inert;
- Gmail message/attachment, invoice/order, and fingerprint deduplication;
- checkpoint replay, explicit rescan, concurrency, and partial failure;
- malformed MIME/PDF/image and oversized attachment rejection;
- version-1 compatibility and preservation of the existing receipt set;
- GST/HST, PST, combined/unknown tax handling without guessed allocation;
- actual due date versus expected renewal;
- unknown/multiple currency separation;
- verified write/read-back and no “filed” claim on failure;
- forbidden fields absent from browser results and Manager prompts.

Then run focused tests, the full test suite, TypeScript checking, and the production build. No provider call, database migration execution, deployment, publishing, or Safe Highways access will occur during implementation.

## Known setup blocker

A separate CanX Gmail workspace connection does not currently exist for this project. The available connection is **Safehighways** and is out of bounds. After the code and migration are ready, a workspace owner must create a CanX Google Mail connection and link it to this project once. Until then, the workflow will report Gmail as disconnected and make no mailbox request.
