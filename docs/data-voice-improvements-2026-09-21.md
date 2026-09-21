# Data voice conversation improvements — 21 September 2026

Implemented in the existing CanX Office GitHub project. This is a review branch, not a production deployment.

## Changes

- Ending Voice Mode or closing the Manager discards an unfinished recording instead of submitting it.
- Late microphone permission, transcription, speech generation and playback results cannot revive an ended session.
- A single microphone request is allowed at a time. Each recording keeps its own audio chunks.
- “Interrupt and talk” stops the current spoken answer (or pending speech generation) and starts a fresh recording.
- The next listening turn is scheduled only after playback ends, with a cancellable timer.
- Errors stop the automatic loop so a blocked AI request does not keep reopening the microphone.
- Browser-blocked playback retains the generated audio for “Play answer”, without another speech request.
- Audio unlocking uses a valid silent WAV with samples; late unlocking cannot pause a real answer.
- Data's name and introductory copy now match the Manager's existing Work Board abilities.

The existing task creation, assignment, verification and office memory tools remain in use. This change does not add a new database or memory system. The current voice architecture still records a turn, transcribes it, asks the Manager, and generates speech; it is not a new realtime audio service.

## Verification

- Full test suite: 467 tests passed across 32 files, including 9 new asynchronous media regression tests.
- TypeScript: passed.
- Production build: passed.
- New tests use mocked browser media and hook state. They check recording cancellation versus submission, delayed permission, cancelled encoding, delayed playback rejection, stale ended events, buffered replay, delayed unlock and WAV validity.
- Existing framework deprecation warnings remain. Dependencies and lockfile were not changed; local validation installed dependencies with npm because Bun is unavailable here.
- No paid AI calls or live owner task writes were made. No Lovable build credits were used.

## Remaining acceptance check

After the reviewed change is deployed, test in the signed-in office on desktop Chrome and John's Android Chrome:

1. Open the Manager and start Voice Mode. Ask Data for today's priorities. Hear the answer and check that listening resumes once.
2. While Data is speaking, press “Interrupt and talk”. The old answer must stop and a new turn must record.
3. End Voice Mode while recording, while understanding speech, and while preparing an answer. No new answer should start, and the microphone must stay off.
4. If the browser blocks playback, press “Play answer”. It must play the already-generated audio.
5. Ask Data to create a clearly named test task, then check the Work Board and ask Data to report it back. Follow the existing approval rules for protected actions.

Physical speaker output, production credentials, remaining API budget, natural conversation latency and live task persistence have not been verified by these local tests. Ending voice prevents late speech and unsent turns; it cannot undo a task request already accepted by the server.
