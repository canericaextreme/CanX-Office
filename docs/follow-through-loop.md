# Follow-through and shared memory (19 Oct 2026)

John's ask (18 Oct): flagged issues should get worked and verified instead of going stale waiting
for him to re-prompt, and ChatGPT, Claude and Elsie should remember what was said to the others.

## Shared memory: three sticky notes

| Who | Where their side of the conversation is saved | Read by |
| --- | --- | --- |
| Elsie | `astra_conversation_summaries` (already automatic) | Claude, ChatGPT via `read_office_records` |
| Claude | Brain note `handoff-latest-claude` (+ dated copy `handoff-claude-YYYYMMDD-HHMM`) | Elsie (every answer, voice and typed), relay, ChatGPT |
| ChatGPT | Brain note `handoff-latest-chatgpt` (+ dated copy) | Elsie, relay, Claude |

- Code: `src/lib/conversation-handoff.ts`. Elsie reads both notes in `readAstraContinuity`; the
  colleague relay adds them to its message. Both are labelled as assistant-written data, never
  instructions or John's approval.
- The rule is in the Office connector's own instructions (`src/lib/office-mcp.ts`), which every
  connected ChatGPT and Claude sees at the start: read the three, and save your handoff before you
  finish with John.
- No new table, permission or credential: notes use the existing `write_office_record` grant.

## Follow-through check-in (proposed, needs John's OK)

A scheduled Claude task in the CanX Office project, using the connector access John already
granted. No new service key; Elsie's own unattended worker (PRs 127-132) stays off.

Each run:
1. Read the Brain first, both handoffs, Elsie's summary, and open/waiting Work Board tasks.
2. Pick items that are flagged and stale: no change for 2+ days, a PR waiting on checks, a
   "published but not verified" note, a maintenance task from PR 162.
3. Work only what John already approved (merge-robot routine work, read-only checks, live
   verification by picture). Anything about money, permissions, security, publishing, deleting or
   a new decision goes to John as one "YOUR OK IS NEEDED" line in the project chat, never acted on.
4. Verify live (picture or read-back), write a short Brain note and task update, refresh
   `handoff-latest-claude`.
5. Cap: at most 3 items per run, no paid Office builds without John's word.

## Relay limits found

- Relay works only on green tasks (`canx_private.relay_save`). John's yellow task a4a74206 was
  refused. Allowing yellow is a permission change, so it waits for John's word.
- The 9 Oct "raw access / OAuth" failure on task ab619d17 was fixed on 10-11 Oct (relay now uses
  the working-grant functions); that task's waiting note is out of date.
- The relay colleague has no tools; it can advise but not open PRs or pictures.

## Verified material-work checkpoint — 21 October draft

The material-work save path now lives in `src/lib/brain-handoff.ts`, called by the existing
`write_office_record` service for the two latest-handoff IDs. The earlier short-paragraph and
minute-stamped-copy procedure above is historical for these writes. Use a `brain-handoff-v1`
JSON string in `data.detail` with the required fields documented in the shared connector
instructions and `src/lib/AGENTS.md`. There is no new tool, grant, table or job executor.

A save first preserves `handoff-job-{assistant}-{jobId}`, then compares and saves latest using
the supplied version. Independent reads verify both records' requested fields. Identical retries
reuse existing records; changed evidence under the same job ID, read errors, mismatches and
concurrent latest changes remain pending. A lost acknowledgement is recovered by reading before
writing. History is immutable through this path, not a new database restriction. Existing database
record tools retain their permissions. A checkpoint status of blocked or pending remains that status
even after persistence verifies. Full structured handoff evidence is retained in colleague context;
legacy prose keeps its existing context bound.

Before work, assistants retrieve latest and relevant exact job/project records with existing reads.
This is shared connector guidance, not a global lock on external assistants or a new execution gate.
Unrelated tasks/builds/voice behavior is unchanged. An assistant that ignores the protocol can still
answer without saving; this local repair cannot control external clients or their completion UI.

Local inspection: main and cached origin/main are `de350ab`. No remote freshness check or open-PR
listing was performed because this task forbids production calls and no offline PR snapshot exists.
The named Brain notes `brain-handoff-rule-20261021` and
`brain-safe-highways-location-check-20261021` are references supplied by John, not locally retrieved
records. Their contents, real latest project handoff, and open PR overlap remain acceptance checks.

Live acceptance still requires an owner-authorized environment: retrieve those notes and relevant
project handoff, save/read back a non-sensitive checkpoint, interrupt the response and retry the same
save without re-running work, then reopen a native assistant session and retrieve the exact history.
Test both Claude and ChatGPT connector clients. Device testing should verify close/reopen context
and accurate pending/completed wording; no voice/audio code changed or voice verification claimed.
No production save, publication, push or external contact occurred in this repair.
