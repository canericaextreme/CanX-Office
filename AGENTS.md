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
- Finance/Gmail/receipt rules: see `src/lib/AGENTS.md`.

## Office Skills
- Canonical skill instructions and the registry live in `src/lib/office-skills.ts` (versioned, with provenance from John's skills map); never fetched from a ChatGPT Skill Library at runtime. Why: Elsie must stay independent of ChatGPT and Lovable.
- Typed Elsie chat appends deterministic request-aware skill output (router + owner-decision filter always, at most 3 matching installed task skills) to the system instructions; broad room reviews disclose procedures omitted by the cap, and skills grant no tools. Live voice sessions embed only the always-on core skills (`voiceSessionSkillGuidance`, fixed at session mint); task skills reach voice per turn via submit_office_request → the same room-aware path. Why: bounded context and no new tools or permissions.
- Master-map outlines and the five approved actual-room drafts are complete installed instructions while `kind` preserves provenance; `instructionReady`, `toolConnected`, `routingTested`, and owner-confirmed `liveTested` remain independent states. Why: installation must never imply a connector or real-world verification.
- Rooms only link to skills (`RoomSkillsLink`); editable instructions exist only on /skills, reached from Family Continuity & Training. Why: one master copy, no duplicates.
- Mail Keep/Ignore preferences live as `mailPreferences` in the owner-only `finance_receipts.doc` (`src/lib/mail-preferences.ts`), written only via `casUpdateFinanceDoc` with change-verified readback; ingestion applies them before reading bodies (message choice by mailbox+ID, sender rules by exact normalized address, Keep precedence), and Elsie changes rules only through the deterministic `parseMailRuleCommand` path naming an exact address. Why: explicit reversible owner rules, never model-invented or self-learned filters.

## Room snapshots
- Room identity comes only from `src/lib/office-room-identity.ts` (office map first, exact route match, no Reception fallback); RoomShell, RoomReports, room commands and snapshots use it. Why: Research/Family Continuity were mislabelled as Reception.
- Every room view (RoomAccessBar) and every typed/voice Elsie request read the same owner-token snapshot contract (`src/lib/room-snapshot*.ts`); sources are labelled live/device/static, Finance-doc sources need AAL2; device-only sources are read only from a fresh same-room device report (`room-device-snapshot.ts`, untrusted) else device-unavailable; a room is fully verified only with every live+device source read, a known build id, and the owner's Build & Testing room check only after the owner runs Build & Testing's room check on the current build. Why: one truthful source for John and Elsie, never a green light from connectivity alone.

- Brain is the Office hub: `src/lib/brain-index*.ts` indexes existing records into Downloads/Knowledge/Discussions/Memory/Projects/Rules & Skills by explicit provenance only (unknown → Needs a category); manual filing is a separate deterministic-id label row in office_notes (source "Brain index: category") with readback, never a move. The same index feeds BrainHub, the /brain room snapshot and Elsie per request (metadata only). Why: one categorized registry without schema changes or touching originals.

- Project register (`src/lib/project-register*.ts`) is built only from saved owner office_notes with source "Lovable project import"; category and John's plan (goal/room/stage/next move) are separate label rows (sources "Project register: category" / "Project register: plan", read back); project-locator.ts joins tasks only by exact project UUID or plan-linked task id, and ready/market/completed come only from John, never edits to import records, and the app never seeds project records. Why: imported metadata must stay intact and real.
