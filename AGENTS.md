<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Office system health (not the personal /health room)
- Release health lives in `src/lib/office-health.ts` + Build & Testing `OfficeHealthPanel`: an update is "verified" only when every saved-data room in `POST_PUBLISH_ROOM_CHECKS` was opened signed-in on the current build fingerprint; connectivity, anonymous HTTP 200 and fixture renders never count. Why: a signed-out 200 hid the Brain crash.
- No background monitor exists (`HEALTH_SCHEDULE.configured = false`); do not present checks as continuous until a real owner-authorised scheduler exists. Why: signed-in checks need owner MFA.
- Populated room components are exported (e.g. `SavedFileList`) and covered by fixture-render tests. Why: empty-state tests missed the Brain tooltip crash.

## Subscriptions and billing evidence
- Subscription records and mail-derived billing evidence live as `subscriptions` / `subscriptionEvidence` / `subscriptionLastCheck` keys inside the owner-only `finance_receipts.doc`; every writer (including receipt saves) must preserve the other keys. Why: reuses existing owner/MFA row security with no schema migration.
- Every write to `finance_receipts.doc` goes through `casUpdateFinanceDoc` (conditional PATCH on owner_id + updated_at, bounded retry, content-verified); never an unconditional upsert. Why: overlapping saves silently lost data.
- Gmail paging resumes from per-mailbox `gmailContinuation` tokens in the same doc, advanced only after a fully fetched page and a verified write. Why: the capped first page otherwise repeats forever.
- Every supported body/attachment from a fetched page is processed (no document truncation); attachment fetch failures or the per-page document cap keep the page position, and lastCheck.complete is written only after receipt, evidence and continuation writes verify. Why: dropped parts were silently skipped.
- Mail evidence never overwrites John's confirmed cost or renewal date; unknown/conflicting senders are filed only as needs-review, personal-scoped services are not filed. Why: no automatic office-expense or tax claims.
