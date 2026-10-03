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
- Receipt ingestion calls the deployed `ingest_finance_receipts` RPC in sequential batches of at most 25 (`finance-ingest-batches.ts`) with the existing checkpoint; the checkpoint advances only via a final candidate-free call after all batches, evidence and continuation verify, and readback must find every candidate fingerprint. Why: the SQL rejects >25 candidates.
- Mail evidence never overwrites John's confirmed cost or renewal date; unknown/conflicting senders are filed only as needs-review, personal-scoped services are not filed. Why: no automatic office-expense or tax claims.

## Office Skills
- Canonical skill instructions and the registry live in `src/lib/office-skills.ts` (versioned, with provenance from John's skills map); never fetched from a ChatGPT Skill Library at runtime. Why: Elsie must stay independent of ChatGPT and Lovable.
- Typed Elsie chat appends `routeSkills()` output (fixed keyword router; router + owner-decision filter always, at most 3 core task skills) to the system instructions; outlines/drafts are never loaded, and skills grant no tools. Live voice sessions embed only the always-on core skills (`voiceSessionSkillGuidance`, fixed at session mint); task skills reach voice per turn via submit_office_request → the same `routeSkills` chat path. Why: Realtime has no safe per-turn instruction hook; no new tools or permissions.
- Rooms only link to skills (`RoomSkillsLink`); editable instructions exist only on /skills, reached from Family Continuity & Training. Why: one master copy, no duplicates.
- Mail Keep/Ignore preferences live as `mailPreferences` in the owner-only `finance_receipts.doc` (`src/lib/mail-preferences.ts`), written only via `casUpdateFinanceDoc` with change-verified readback; ingestion applies them before reading bodies (message choice by mailbox+ID, sender rules by exact normalized address, Keep precedence), and Elsie changes rules only through the deterministic `parseMailRuleCommand` path naming an exact address. Why: explicit reversible owner rules, never model-invented or self-learned filters.

## Room snapshots
- Room identity comes only from `src/lib/office-room-identity.ts` (office map first, exact route match, no Reception fallback); RoomShell, RoomReports, room commands and snapshots use it. Why: Research/Family Continuity were mislabelled as Reception.
- Every room view (RoomAccessBar) and every typed/voice Elsie request read the same owner-token snapshot contract (`src/lib/room-snapshot*.ts`); sources are labelled live/device/static, Finance-doc sources need AAL2, and a room counts as verified only after the owner runs Build & Testing's room check on the current build. Why: one truthful source for John and Elsie, never a green light from connectivity alone.
