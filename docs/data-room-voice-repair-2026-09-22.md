# Data voice and room access repair — 22 September 2026

## Problems addressed

The realtime audio element was first created after microphone and server awaits, outside the mobile tap gesture. Room inspection was available only through a separate Rooms-panel button; spoken requests did not use it. Realtime context was loaded at session start, letting Data repeat stale approval states. The voice UI lacked microphone mute and explicit interruption controls.

## Implemented behavior

- Unlock the same attached audio element synchronously in the Talk tap. Preserve Enable sound recovery.
- Request echo cancellation, noise suppression and automatic gain control. Use provider near-field noise reduction and explicit semantic turn detection. These reduce interference; they do not identify John or guarantee that TV speech is ignored.
- Mute/unmute the current microphone without reconnecting. Interrupt cancels generation and clears buffered remote audio. End still releases tracks and invalidates late callbacks.
- Track WebRTC output-buffer events so generating-complete is not mistaken for playback-complete.
- Read typed replies over an active voice session with tools disabled for the readout.
- Visible Test speaker control works independently of microphone capture.
- Route direct typed and spoken room requests through one allowlisted handler. It navigates to a known room, takes the existing redacted Office-only snapshot, and returns a timestamped review. All 20 directory rooms are available individually. Loading/error screens are reported as seen; a snapshot is not continuous surveillance or a complete audit of external systems.
- Ask the realtime model to refresh live office facts through the existing request tool rather than arguing from its startup snapshot.
- Direct small changes: conversation text size, moving Data's panel left/right, and adding an owner-written report to a named room. Reports use existing owner-verified, audited shared notes and require readback before reporting verified success. They display in their destination room and remain visible in Records.
- Unknown commands continue through the existing Manager. Arbitrary code/layout editing, automatic report authoring, cross-tab viewing and background surveillance are not implemented. A task is never proof that a code change was made.

Examples: “Check Subscription Watch”, “Make the text larger”, “Move your window to the left”, “Add a report to Finance: Review September renewals on Monday.” Spoken reports can use “saying” instead of a colon.

## Validation

560 automated tests passed, including new tests for all room destinations, excluded/negative requests, microphone mute/interrupt, synchronous audio unlock, actual playback state and tool-disabled typed readout. Updated three stale source assertions that still expected the old Start conversation label. TypeScript and production build passed. No dependency or database schema changes.

Live microphone/speaker acceptance on John's Android device remains required. The Cloud Browser has no microphone. ChatGPT's proprietary voice runtime and tool permissions cannot be transferred to this app. Provider billing, rate limits, network and browser permissions can still block voice; failures must be reported, not hidden or described as repaired.

References: https://developers.openai.com/api/docs/guides/realtime-vad and https://developers.openai.com/api/docs/guides/realtime-conversations
