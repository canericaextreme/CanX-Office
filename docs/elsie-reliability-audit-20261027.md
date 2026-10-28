# Elsie reliability audit — 27 October 2026 (Whitehorse)

Status: unreleased candidate. Local checks demonstrate the repairs below, not end-to-end Office readiness. No merge or live publication is authorised by a passing fixture suite. Brain originals, backend schema, provider configuration, budgets, permissions and the companion chatbot are unchanged.

## Audit before repair

The existing architecture already has a useful centre: `OfficeManager` sends typed and standard voice requests through `managerChat`, which verifies the owner/MFA, reads fresh Office context, reserves the existing budget, calls the configured provider and dispatches guarded tools. Standard voice uses Realtime for hearing and playback; the separate direct-voice preview can answer ordinary conversation itself. Preserve the standard path rather than adding another agent, planner, memory store or orchestration layer.

| Area examined | Finding |
| --- | --- |
| Instructions and skills | The manager prompt was 19,004 characters. Personality and evidence rules repeated themselves, and a blanket prohibition on code without approval conflicted with the explicit green builder workflow. Skills are already bounded to core procedures and at most three task procedures per turn; no new registry is needed. |
| Brain and memory | Owner-scoped memories, recent turns, summaries, exact goals and colleague handoffs already exist. Reconnect reads both conversation and tasks, but discarded waiting tasks and discarded both results if either read failed. Brain retrieval and room-source failures are labelled; they must not become invented facts. |
| Voice | Completed Office text is kept independently of playback. Existing noise/empty-transcript settlement works and its tests pass; an initial suspicion about that path was rejected after tracing it. A real race remains: an older request's late failure or empty reply resets the latest turn's phase and displays a retry instruction. Retrying an action after a lost answer can duplicate work. |
| Room awareness | Requests use exact canonical room identities, fresh room snapshots, provenance, build fingerprints and explicitly untrusted device observations. A directory entry, anonymous HTTP 200 or fixture screenshot does not prove access to saved room contents. Keep these controls. |
| Collaboration and builds | Existing task execution uses one-attempt claims, builder identity and durable receipts. The text-only Elsie/worker/report loop is bounded and explicitly continued; it is not an unattended worker or native-chat synchronization. Do not introduce automatic replay, another collaborator, paid fallback or a scheduler. |
| Task completion | Verification could mark a cancelled task done, overwrite the old evidence, race another update and report completion from a write response without independent task readback. Assignment completion ran concurrently even if the task write failed. |
| Version control and release | Work began at `45b3d21a87a4b47b4f12500578b3870727e944c5` with a clean checkout. Changes are isolated on `codex/elsie-reliability-audit-20261027`. No auto-merge label, merge or live publication belongs in this candidate while acceptance remains blocked. |

## Repairs

1. Reconnect keeps waiting tasks and their waiting reason. Conversation and task read availability are independent; available evidence survives the other source's failure. Finished tasks stay excluded even if they retain an old handoff marker.
2. Late failures and empty replies still mark their original voice turn failed, but cannot reset or display an error on the latest turn. Current failures advise checking receipts before repeating actions. No provider/model/VAD change or automatic retry was added.
3. Task verification refuses finished tasks and missing versions; retains previous evidence; enforces the existing 2,000-character evidence capacity without dropping history; uses an owner/version/status conditional write; independently reads back the exact completed task; and updates assignments only after task completion is confirmed. A Brain checkpoint alone still does not mean the task is complete. A failed readback leaves the outcome explicitly unverified, never permission to repeat the job.
4. The main prompt is 16,769 characters, about 12% shorter. Repeated personality/evidence instructions were consolidated and the green-build approval contradiction removed. Fresh authorization, tool receipts, Brain preservation, the default builder and protected-action gates remain. No runtime connection or authority was broadened.

Task completion verifies the persisted outcome and its evidence; it cannot independently prove physical work, external deployment or real-world quality. Those still need their corresponding tests and receipts. Oversized evidence deliberately leaves a task unfinished rather than discarding its history. Assignment/log projection remains a best-effort secondary update; the independently read-back task is authoritative.

## Validation evidence

- Before changes: typecheck passed; 221 Vitest files / 2,173 tests passed.
- Five new reconnect/voice cases were run against the original code: all five failed, reproducing waiting-task loss, partial-read loss and stale voice errors. Existing empty/noise-turn cases passed.
- After functional repairs: full Vitest suite passed, 221 files / 2,183 tests. This includes existing Brain, exact room identity, snapshot/readback, mobile overlay, builder no-replay and bounded colleague-loop coverage. These use synthetic records/providers; they are not signed-in live tests.
- Typecheck and production build passed. Five dependency-free Node test files passed. Focused repaired paths passed after formatting.
- Real local Chromium rendered the app and opened Elsie's panel at 1440×900 desktop, 390×844 phone portrait and 844×390 phone landscape. No browser page exceptions or horizontal document overflow were observed. The signed-out panel reported `Authenticator required`. Pressing Talk to Elsie opened Account and sent zero OpenAI requests in all three viewports. Brain, Finance and Work Board signed-out routes also rendered without page exceptions; saved records remained unavailable. Viewport emulation is not a physical-phone microphone test.
- Repository-wide `bun run lint` failed: 14,089 errors and 37 warnings in the final check, predominantly formatting. Comparing original and changed source confirmed extensive existing formatting failures and no new non-format rule failures in touched files. Targeted formatting reduced the error count from the earlier 14,160 errors; the repository-wide failure remains a release blocker, not a passing check.
- Dependencies were installed outside the checkout from exact locked npm artifacts with all integrity hashes retained. Only the external installation copy changed 76 Lovable-cache URL prefixes to the official npm registry; the repository manifest and lockfile were not modified. The configured cache hosts still return CONNECT 403. No TLS/checksum verification was disabled.

## Blocked acceptance — do not mark these passed

No authenticated Office connector tools or owner session are available to this task. The cloud process has none of `CANX_SUPABASE_URL`, `CANX_SUPABASE_PUBLISHABLE_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` or `CANX_CODEX_GITHUB_TOKEN` configured. Platform Git authentication works separately and does not establish these capabilities. Do not paste credentials into chat, invent values or bypass the owner gate.

The following require the candidate in an authorised private test environment with the existing secure backend/provider configuration and the owner's sign-in/MFA. They remain unrun:

1. Desktop and physical phone: start a real voice conversation, ask a normal question, interrupt, correct a request, mute/unmute, end/reconnect, and verify audible answers and the saved conversation. Repeat phone portrait/landscape and keyboard use. Emulated microphones cannot prove recognition quality, echo handling or naturalness.
2. Ask Elsie to retrieve an exact pre-existing Brain record and latest relevant colleague handoff, accurately explain them, save an explicitly requested test note and independently read it back. Check reconnect retains the relevant decision and clearly separates missing history from no history. Original records must remain intact.
3. Open Brain, Finance and Work Board signed in; ask about the actual current room and another named room. Match the answer to fresh source/version evidence and disclose unavailable/device-only sources. Anonymous room rendering is insufficient.
4. Delegate one explicit bounded test writing task to the named Office API colleague, follow its phase receipts, independently retrieve the final Brain result from another authorised colleague, then verify completion and linked task state. Test concurrent verification, cancellation and unavailable readback without replaying paid work.
5. For an authorised draft code task, verify the exact branch/commit/run/PR receipts and blocked/ready states. Failed or uncertain submissions must never be resubmitted automatically. A successful draft is not a merge or published release.

Review the candidate and resolve lint/acceptance blockers before any merge or live publication. No claim is made that Elsie is now reliable end-to-end or that live Office health has passed.

GitHub CLI authentication was checked in the network-enabled context and reported its existing token invalid. Git proxy access is separate; do not replace the injected authentication or request secret values in chat. A remote branch save, if confirmed, does not create a draft PR or publish the app.

## Remote save after owner authorization

The owner explicitly requested completing the pushes. Candidate commit `e9855a51ccd86f10961bf1f6f49040d443d10b38` was pushed to `origin/codex/elsie-reliability-audit-20261027`; `git ls-remote` independently confirmed that exact remote commit. This is a review branch, not a merge, published application or verified private preview. Live acceptance and lint blockers above remain. No draft PR was created; the existing GitHub CLI authentication was unavailable.

## Follow-up before private testing

The repaired reconnect module and its tests now pass ESLint with zero errors or warnings. Formatting in the completion-verification function also follows the repository's configured line width; executable syntax was independently compared before/after and is identical. The final full suite still passes: 221 files / 2,183 tests; typecheck and production build pass. Repository-wide lint remains failed outside this limited cleanup, so no merge or live publication is claimed.

The remaining prerequisite is a private test deployment of this review branch using the existing secure Office configuration. This tool session cannot create a Lovable preview, authenticate GitHub API operations with the currently unavailable CLI binding, or access the owner's browser session. The owner must make the candidate available in a private preview and perform the signed-in/MFA and physical-microphone portions of acceptance on their devices. Sharing a preview URL does not transfer the owner's signed-in session. Production must remain unchanged.

## Systems voice acceptance follow-up

The owner heard Elsie's spoken answer in the private preview. Elsie reported a count of 23 links but could not identify individual connection statuses, and offered a general live check without demonstrating an available tool. The reported count has not been independently mapped to the app's configured connection inventory.

A reproduced snapshot defect returned the static Systems connection source with no entries and a null count. The reader now includes all nine canonical Office inventory entries, their configured stages, explicit static statuses and existing notes, with clear limits: these are configuration labels, not live checks, browser-panel results or inherited ChatGPT authorizations. No provider calls, connection changes or new tools were added. Elsie's instructions now prohibit offering a general connector check when no exposed tool supports it. Dynamic Systems panel health remains unavailable in this snapshot; no full live-status repair is claimed.

Regression failed on the previous reader and passes with the repair. Full suite: 221 files / 2,184 tests passed; typecheck and production build passed. Preview acceptance remains pending after sync. End any old voice session, refresh the candidate preview, start a new conversation in Systems and ask Elsie to name the saved Office inventory entries and their configured stages/static labels without running checks. Expect nine configured Office entries, not an invented grouping of the reported 23 links. A screenshot of the 23-link section is needed only if that separate list still requires identification.

## Inventory topic routing follow-up

The owner's next preview answer said the inventory was missing and referenced Reception. Reproduction showed the same inventory question, submitted from Reception without the literal room name Systems, read only Reception. The previous inventory-reader repair therefore could not help that request. Room targeting now treats explicit Office connection-inventory/stage/status/label wording as a Systems read when no other room was explicitly named, while retaining the current room as a separate source. An explicitly named room still takes priority. This is read-only context routing; no navigation, authorization, provider or connection change was added.

The routing assertion failed before repair. New integration cases exercise the actual manager provider-request payload in both typed and voice modes from Reception: Systems is read first and the configured Calendar/Drive entries, static status and live-check limitations reach the provider. These checks validate context delivery, not the model's live spoken answer. Owner preview acceptance remains pending after sync.

Routing follow-up validation: 221 files / 2,186 tests, typecheck and production build passed. Existing repository-wide lint failures remain separate and unresolved.
