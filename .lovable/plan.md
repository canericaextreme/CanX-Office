# Office Manager voice reliability plan

## Confirmed diagnosis

- The Office Manager listens through the browser’s speech-recognition feature and speaks through the phone’s built-in reading voice.
- The working ChatGPT companion uses a real two-way audio connection and an attached audio player; it does not use the phone’s reading voice.
- On the Manager path, Android can end recognition after a pause and the code reopens it after 80 milliseconds. Each reopen can trigger the phone’s listening sound, producing the reported repeating beep.
- Stopping listening also does not confirm that Android has released the microphone before speaking starts. The two phone services can compete, leaving the Manager listening but silent.
- The Manager also depends on installed phone voices, delayed voice loading, and browser callbacks that Android Chrome and iPhone Safari may drop.
- iPhone browsers do not provide dependable support for the Manager’s current browser dictation method, so fixing playback alone would not meet the cross-phone requirement.
- Existing tests check that certain code is present and ordered; they do not prove that audible sound was produced on a real phone.
- The repeated timing, retry, chunking, and keep-alive fixes are workarounds around this unreliable playback path. More timing changes would not make it dependable across phones.

## What will change

1. **Leave ChatGPT Chat untouched**
   - Do not edit its voice connection, controls, prompts, screen sharing, or tests.
   - Add a guard test confirming the Manager remains separate and the chatbot files stay unchanged.

2. **Replace only the Manager’s voice transport**
   - Keep the existing Office Manager conversation, permissions, approvals, tools, records, and written answers.
   - Stop using both the phone’s built-in speech recognizer and its built-in reading voice for Manager Voice Mode.
   - Capture microphone audio through the normal browser microphone permission, transcribe it through a Manager-only server endpoint, and pass the resulting text through the existing Manager request path.
   - Generate the approved written Manager reply as audio through a separate Manager-only server endpoint, then play it through a real, attached page audio player.
   - Use no new provider, connector, subscription, key, browser popup, or external page.

3. **Make mobile playback deliberate and reliable**
   - Prepare the Manager’s microphone and audio player during John’s Talk button press so Android Chrome and iPhone Safari permit them.
   - Use a clear turn-taking cycle: listen, transcribe, run the existing Manager request, prepare voice, speak, then listen again.
   - Fully release microphone recording before starting answer audio, eliminating the recognizer restart beep loop.
   - Let John stop playback and begin the next turn without overlapping microphone and speaker activity.

4. **Fail honestly**
   - Use clear states: Listening, Working, Preparing voice, Speaking, and Audio unavailable.
   - If spoken audio cannot be prepared or played, keep the written answer and show a short retry control.
   - Never silently fall back to the phone’s built-in reading voice and never claim audio played without a confirmed playback event.
   - Keep the existing Voice check, but update it to report real player events rather than browser voice-pack information.

5. **Preserve Manager safeguards**
   - Ordinary signed-in conversation remains AAL1.
   - Existing owner checks, MFA step-up, spending/rate controls, approval rules, and server-side action execution remain authoritative.
   - No database, schema, records, settings, connectors, secrets, routes, or deployment changes.

## Technical details

- Add a Manager-only server function that converts the already-approved written Manager reply into bounded audio using the existing server-only OpenAI key.
- Add a Manager-only server function that transcribes a bounded audio turn using the same server-only key. Audio is processed for that turn only and is never saved.
- Return only the audio needed for that reply; do not save recordings or generated audio.
- Use `MediaRecorder`/standard microphone capture for input and an attached `HTMLAudioElement` for output, with strict size/time bounds, explicit playback handling, object-URL cleanup, cancellation, and event evidence.
- Remove the Manager’s recognizer auto-restart loop, silent primer, speech chunk timers, synthesis queue retries, and synthesis keep-alive once the replacement is verified.

## Verification

- Focused tests for Manager-only recording/transcription, audio preparation, playback success/failure, mic-stop-before-play, listen-after-end, interruption, cleanup, strict bounds, and no local speech fallback.
- Tests proving ChatGPT Chat and ChatGPT Work are not imported, opened, called, or changed by Manager voice.
- Full test suite, TypeScript check, and production build.
- Browser checks at desktop and mobile viewport sizes for controls, states, and written fallback.
- Final real-device checks on Android Chrome and iPhone Safari are required because automated browser tests cannot prove that a physical speaker produced sound.

## Boundaries

- Private preview only; do not publish or deploy.
- Do not change ChatGPT Chat.
- Do not change Office data, authentication policy, MFA, Manager authority, approvals, or action rules.
- No audio, transcript, or diagnostic history is persisted.
