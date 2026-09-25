# Astra persistent conversation repair

## Goal
Keep Astra’s own text and voice conversation coherent through reloads, lost mobile service, reconnection, and owner sign-in changes—without replaying commands, inventing saved state, or weakening owner/MFA controls.

## What will change
1. **Immediate owner-scoped device checkpoint**
   - Persist the visible completed conversation and unsent composer draft promptly, instead of waiting for the 12-second summary timer.
   - Scope the cache to the server-verified owner ID; clear it on sign-out or owner switch.
   - Restore it into Astra’s visible conversation after reload, with explicit device-buffer and unsynced labels.
   - Bound message count, text length, and age; store no credentials, audio, provider payloads, or hidden office context.

2. **Safe completed-turn outbox**
   - Give every completed text or voice exchange a stable turn ID and local sequence.
   - Queue only conversation persistence—not AI requests, room commands, tools, approvals, or other actions.
   - Retry pending persistence after reconnection, token refresh, owner verification, or explicit retry.
   - Treat unknown delivery as unsynced and prevent duplicate sends; never describe it as saved in CanX Brain.

3. **Verified cross-device checkpoint**
   - Add one additive, unapplied migration for an owner-scoped Astra conversation checkpoint and an idempotent append function.
   - Include explicit grants, strict owner/AAL2 RLS, unique owner/conversation/turn IDs, monotonic sequence handling, bounded retention, atomic readback, and append-only audit entries.
   - Add server functions to load and append checkpoints through the owner’s session only.
   - If the migration is unavailable, keep the device buffer working and show that cross-device continuity is unavailable; do not fall back to unsafe duplicate writes.

4. **Context and visible restoration**
   - Load verified checkpoint turns on reopen, merge them deterministically with the device buffer, and show source and timestamp.
   - Include restored completed turns in the next typed reply and in refreshed live-voice context.
   - Keep curated CanX Brain summaries visually and semantically separate from the last conversation.
   - Load and display the latest durable task status through the existing workbench records; report failed reads plainly.

5. **Voice and interruption hardening**
   - Capture completed live-voice user/assistant pairs into the same checkpoint path.
   - Preserve interrupted or disconnected transcript text locally without marking it delivered or replaying it.
   - Correct the current voice pairing marker so only a readback-confirmed server save suppresses the local outbox.

6. **Existing boundaries preserved**
   - Keep Astra separate from the external ChatGPT session.
   - Preserve current owner/MFA checks, RLS, C$ limits, approval rules, provider model, room actions, voice controls, and office design.
   - Do not publish, deploy, apply the migration, make paid AI calls, or modify Safe Highways/Trail Tales.

## Technical details
- Add a small client-safe continuity module for validation, bounded merge, statuses, storage keys, and persistence-only queue behavior.
- Add owner-verified server functions for checkpoint load/append and extend model-context assembly with source-labelled checkpoint rows.
- Update `OfficeManager` to hydrate before enabling sends, persist draft/thread changes, expose synced/unsynced/read-failed status, and flush only completed-turn checkpoints.
- Extend owner session state with the verified opaque owner ID needed for device-cache isolation.
- Keep the existing 12-second curated Brain summary as a separate optional summary process; it will no longer be the only continuity mechanism.

## Verification
- Add focused tests for interrupted text, interrupted voice, reload restoration, context inclusion, duplicate prevention, auth denial, failed local/server storage, sign-out/owner-switch clearing, migration-unavailable fallback, and no command replay.
- Run focused tests, the full test suite, TypeScript checking, and the production build.
- Verify the private preview on desktop and a mobile-sized viewport without starting a live AI/voice call.

## Expected limitation
Cross-device checkpointing will remain visibly unavailable until John applies the new migration to the existing CanX-owned database. Device reload/crash recovery will work without that migration. A real Samsung Android/Chrome interruption test will still require John’s phone after the private-preview checks.
