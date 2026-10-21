# Elsie to Claude handoff (21 Oct 2026)

John asked for jobs that are too big for, or fail in, Elsie's small GitHub builder
(about 30 steps, no shell, US$2 per run) to go to a full Claude worker on the first
try, and for Elsie to see that Claude has the job and how it is going.

Think of it like a front desk: Elsie writes the job on a ticket, pins it to the board,
and Claude, who walks past the board every hour, takes the ticket and writes progress
on it. Elsie reads the ticket whenever John asks.

## When Elsie hands a job over

- **Up front:** John names Claude and the job looks big (a new tab, panel, room or page,
  a redesign, navigation, "ChatGPT-style", several changes in one request, over 700
  characters, or John says "full Claude" / "Claude Code" / "Claude worker").
  See `needsFullClaude` in `src/lib/claude-takeover.ts`.
- **After a failure:** when Elsie checks a small Claude build and it failed, she hands
  the task over at once instead of reporting "failure" or offering a paid re-run.
- **When asked:** "Give that task to Claude" uses the `hand_to_claude_worker` tool.

Only green CanX Office code tasks are handed over. Nothing here starts a paid builder
run, adds a secret, or changes permissions.

## The two records

1. The task (`manager_tasks`) gets `[claude-takeover <time> <reason>]` in its evidence,
   status `waiting`, worker `Claude`. Only Elsie's server writes this.
2. A Brain note `claude-takeover-<taskId>` (office_notes). Elsie creates it with
   `STATE: waiting`; after that only the Claude worker updates it.

## What the Claude worker does

Line 1 of the note is the status Elsie reads:

`STATE: <state> | LINK: <session link> | PR: <number> | UPDATED: <time> | NOTE: <short text>`

States, in order: `taken`, `working`, `pr-open`, `merged`, `live`, or `blocked`
(NOTE says what John must decide). Keep the later lines (the job text).

1. Read the Brain first (standing rule) and check for an existing PR or thread doing the
   same job. If one exists, point the note at it instead of building twice.
2. Claim the note (`taken` + session link) with the version you read, so two workers
   never take the same job.
3. Build on a `claude/` branch with tests, open a PR, set `pr-open`, label
   `canx:auto-merge`, and merge once checks are green (John's standing rule).
4. Set `merged`, then `live` once the Lovable publish is confirmed.
5. Money, secrets, permissions, deleting data or anything irreversible: set `blocked`
   with a plain NOTE and stop.

When the note names a PR, Elsie also reads that PR live from GitHub (read-only), so a
merged PR shows as merged even if the note is behind.

## Pickup timing

A scheduled Claude task checks for handed-over jobs about every hour, using John's
existing Claude account and the CanX Office connector. No new credential or API spend.
Starting a Claude worker instantly from Elsie would need a new service credential,
which is John's decision (see the open unattended-queue decision, PR 181).
