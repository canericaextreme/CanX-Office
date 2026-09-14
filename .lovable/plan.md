# Office Manager voice audit — it hears, it will not talk

Confirmed situation: Android phone, Chrome. The companion Chat voice does play sound on the same phone, so the phone, the volume and the app's connection to the internet are all fine. Only the Office Manager is silent.

That difference matters: Chat plays sound through a real audio player from a live call. The Office Manager instead asks the phone's own built-in reading voice to speak. So the fault is in the Manager's reading-voice path, not in the phone.

## What the code shows so far (read-only review)

- The Manager turns the microphone on first, then asks the built-in voice to speak. On Android Chrome the microphone and the built-in reading voice fight over the same audio channel — while listening is running, the reading voice is commonly silenced. This matches exactly what you hear: beeping and listening, no talking.
- The Manager waits a fraction of a second after you press the button before it starts speaking. Chrome can refuse a voice that does not start inside the button press itself.
- The code already has a way to know whether the voice actually started, but the Manager never checks it. So when nothing comes out, nothing is reported — you get silence with no explanation.

These are strong candidates, not a proven cause. The plan proves it on your phone before changing behaviour.

## Stage 1 — Visible check panel (evidence first)

Add a small, plainly labelled check panel inside the Office Manager, opened from a "Voice check" control. It reports, in plain words:

- whether this browser has a reading voice at all, and which one it picked
- whether the phone reported speaking actually started, and whether it reported it finished
- whether the microphone was running at that moment
- whether the phone refused, errored or simply produced nothing
- a "Test voice (microphone off)" button that speaks one short sentence with listening fully stopped

That last test is the decisive one. If the test sentence is heard with the microphone off, the microphone conflict is confirmed.

## Stage 2 — Fixes, applied only after the check confirms the cause

Planned corrections, each conditional on what Stage 1 shows:

1. Never listen and talk at the same time: fully stop listening before the Manager speaks, and restart listening only once speaking has finished. Barge-in is preserved by restarting listening quickly after each answer rather than leaving the microphone open through the reply.
2. Start the very first sentence inside the button press instead of a moment later.
3. Honest failure: if the phone reports that speaking never started within a couple of seconds, show a short plain message in the Manager ("Your phone did not play the answer aloud — the reply is written below") instead of silence.
4. Keep the reply text on screen either way, so the answer is never lost.

## What stays untouched

- The companion ChatGPT Chat voice and its screen-sharing behaviour
- The ChatGPT Work panel
- Sign-in, MFA, database, records, connectors, secrets, rooms, layout
- Nothing is published or deployed; preview only

## Technical notes

- Files in scope: `src/lib/use-speech.ts` (`useReadAloud`, `useDictation`), `src/components/office/OfficeManager.tsx` (`startVoiceMode`, `speakAnswer`, `resumeListening`, new voice-check panel). No server functions, no migrations.
- Stage 1 surfaces existing `didSpeak()` plus new state: `voices.length`, chosen voice name/lang, `onstart`/`onend`/`onerror` for the last utterance, `dictation.listening` at speak time.
- Stage 2 (conditional): gate `readAloud.speak` behind `dictation.stop()` with a completion callback restarting dictation; move the first `speak()` call out of the 90 ms `setTimeout` for the greeting; add a ~2 s watchdog that sets `speechError` when `didSpeak()` is still false.
- Verification: focused tests for the check panel and the listen/speak mutual exclusion, plus full suite, TypeScript check and production build. Final confirmation requires you pressing Talk on your Android phone — this preview cannot sign in.
