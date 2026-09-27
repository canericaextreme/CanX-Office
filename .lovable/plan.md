# Astra true speech-to-speech — findings and private-preview plan

## Answers first

**Can the current provider and connection do audio in and audio out directly?**
Yes. This is **confirmed in the code**: Astra's "Talk to Astra" already opens a live two-way audio connection to CanX's own OpenAI account (the realtime voice model `gpt-realtime`, over WebRTC). The same server key and the same owner, two-step verification and budget checks already guard it.

**Why it doesn't feel like true speech-to-speech yet (confirmed in the code):**
The live voice model hears you, but then it is told to turn every turn into text, send that text to Astra's separate written "reasoning" model, wait for the written answer, and read it out word for word. So the part of Astra that does the thinking only ever sees a text transcript, never your voice, and each turn waits for two models one after the other. That relay is where the delay and the "reading a script" feel come from.

**Does it need a different model or API?**
No new provider, connector, key or subscription. It uses the same realtime API and model already connected. What changes is **who does the thinking in a conversation turn**: the live voice model answers ordinary conversation directly from your audio, and hands only office work (records, rooms, tasks, saving, approvals) to the existing protected server path.

**What would it cost? (proposed estimate, not confirmed)**
OpenAI's published `gpt-realtime` rates (last checked from public pricing, not re-checked live today): about US$32 per million audio tokens in and US$64 per million out, plus a small amount for the text instructions. In practice that is roughly:
- Listening: about US$0.02–0.04 per minute
- Astra speaking: about US$0.08–0.10 per minute
- A typical 10-minute chat where Astra talks about a third of the time: roughly **US$0.50–0.90 (about C$0.70–1.25)**

This counts against the existing C$100 Manager AI limit and C$500 office ceiling; the budget holds are not changed. A cheaper `gpt-realtime-mini` exists (about a third of the price, weaker reasoning) — not proposed unless you ask. Real cost will only be known from the OpenAI usage page after a real test.

## What would change (proposed)

1. **Direct conversation from your voice.** For ordinary talk, planning and advice, the live voice model answers straight from your audio, so tone, pauses and hesitation reach the model and replies start sooner.
2. **Office work still goes through the protected path.** Anything that reads current records, inspects a room, saves, creates tasks or touches approvals is still sent as a tool request to the existing server controls, with the same owner, two-step, budget and approval checks. The voice model can never save or approve on its own, and never claims something was saved without the server's result.
3. **Same memory.** The session still starts with the verified office context and Astra's saved conversation; each finished spoken turn is still saved through the existing continuity path.
4. **Transcript and written reply on screen.** Your words (live transcription) and Astra's reply text appear in the conversation as now, labelled as spoken.
5. **Interruption.** Talking over Astra stops her immediately (already supported by the connection; kept on).
6. **Safe fallback.** If the live connection can't start, drops, or the microphone/speaker is blocked, Astra says so on screen and offers the current record → transcribe → reply → read-aloud mode. It never silently switches, and never uses the phone's built-in reading voice.
7. **A switch to compare.** A small "Live voice (new) / Standard voice" choice in Astra's voice settings, defaulting to the current mode until you approve the new one.

## Unchanged
Sign-in, owner checks, two-step verification, budgets and spending limits, data permissions, database, the companion/Chat icon, typed Astra, approvals, layout. Not published. No paid calls made by me.

## Test plan (to be run by you after the draft; I cannot hear a real speaker)

**Android phone (Samsung, Chrome), signed in with authenticator:**
1. Open Astra, choose Live voice, press Talk. Confirm one microphone prompt, no repeating beep.
2. Ask a general question. Time from end of speech to first sound (target: under about 1.5 seconds).
3. Interrupt her mid-sentence. She should stop within about half a second and answer the new question.
4. Ask "What's waiting in approvals?" — she should check the office, not guess.
5. Say "Add a report to Idea Garage: test" — confirm it only says saved after the report appears.
6. Turn on airplane mode mid-sentence — confirm an honest "connection lost" message and the Standard voice offer; turn it back on and continue.
7. Lock and unlock the phone; confirm the microphone is released and nothing keeps listening.
8. Check the transcript and written reply match what you heard.

**Computer (Chrome and Edge; Safari if available):**
Repeat steps 1–5, plus: block the microphone in the browser and confirm the fallback message; use headphones and speakers to check she doesn't hear herself; end the conversation and confirm the microphone light turns off.

**Afterwards:** compare the OpenAI usage page with the Office budget record for the test.

## Technical details
- Keep `createManagerRealtimeSession` (owner + AAL2 + budget reservation + context) unchanged; add a `mode: "direct" | "relay"` flag that only changes the session instructions and tool description.
- Direct mode instructions: answer conversational turns directly; call `submit_office_request` for any records, rooms, saving, tasks, approvals or memory questions; never claim results without tool output.
- Enable input transcription (`input_audio_transcription`) and capture `response.output_audio_transcript.done` for on-screen text; save via existing `saveSpokenMessage`/checkpoint path.
- Keep `semantic_vad` with `interrupt_response: true`; truncate playback on `input_audio_buffer.speech_started`.
- Fallback: on mint failure, ICE/connection failure, or `playbackBlocked`, stop the session and offer `use-manager-voice` (existing transcribe + speech server functions).
- Tests: mode instructions, tool routing for office requests, no save claim without tool result, fallback on connection failure, relay mode unchanged, Chat untouched. Full suite, typecheck, build. No live paid call.
