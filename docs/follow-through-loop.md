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
