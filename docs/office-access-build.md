# Office-wide access for Claude, ChatGPT and Elsie — build record

Status: **PROPOSED. Nothing here is merged, deployed or live.** Last updated 10 Oct 2026.
Branch `claude/room-capture-phase1`, draft PR #81. No spending incurred.

The build is complete only when all three assistants have independently demonstrated
the required access across the whole Office. **That has not happened.** See "Remaining".

## Explained simply

Think of the Office as a building. John has a key. We want each helper (Claude, ChatGPT,
Elsie) to get a *visitor badge* that lets them look into rooms and read the room notice
boards, but not move furniture, spend money or throw things away, and that John can cancel
one badge at a time. Rooms behind the second lock (authenticator) open only while John holds
the door. The badge never contains John's key.

## Problem → why it matters → solution → acceptance → tests → must not change

| | |
|---|---|
| Problem | Assistants get text only from the connector. The existing "Observe Office" picture is an HTML redraw taken in John's open browser, only when he presses a button. |
| Why it matters | Assistants cannot see what John sees, and cannot work when his browser is closed. |
| Recommended solution | Server-side real Chromium capture on a short-lived, view-only session; private storage; an image-returning connector tool; a room-brief tool for skills, connections and limits; per-assistant revocation. |
| Acceptance | Each assistant, separately and with the browser closed: retrieves a fresh image of each room, retrieves its brief, narrates it accurately, answers follow-ups from evidence; refused when signed out, revoked, expired, wrong room, sign-in page, unavailable room. |
| Testing | Unit tests (in this PR), real-Chromium fixture runs (done), then live per-assistant, per-room runs (not done). |
| Must not change | Room layouts, owner sign-in and authenticator, existing spending controls, workflows, dependencies, migrations (until approved). |

## What is built in this PR (code only, inert)

- `src/lib/room-capture.ts` — rulebook: all 24 rooms from the Office's own identity list, two-step tier derived from the Office's data sources, viewport sizes, strict capture-record check, freshness.
- `scripts/capture/capture-room.mjs` — real Chromium screenshot; never signs in; hides fields; refuses and saves nothing for sign-in page, wrong route, unavailable and blank pages.
- `src/lib/assistant-access.ts` — access rules: separate `office-view-v1` permission, revocation, expiry, 5-minute sessions, 30 views per hour, two-step window cap of 15 minutes, audit row that never holds images or credentials.
- `src/lib/room-capture-result.ts` — builds the MCP message (image block plus record) and the safe refusal wording.
- `src/lib/room-brief.ts` — tour in the established Synopsis order and a brief per room (purpose, sources, skills with assurance level, connections, limits). Keeps *documented* apart from *verified*.
- Tests: 39 passing, including a drift test that fails if a room page is added without updating the list.

## Decisions taken

1. **Real browser on a GitHub Actions runner**, not John's browser. Reason: works with his browser closed, keeps 3-D and frosted panels. Cost: free minutes on a public repo, but the repo is public, so captures must never go in logs or artifacts.
2. **Standard rooms**: captured on a 5-minute single-use session. **Two-step rooms** (Communications, Legal, Subscriptions, Finance, Projects): viewable only inside a window John opens with his authenticator. A headless browser cannot pass the authenticator without weakening it, and we will not.
3. **Elsie** is inside the Office, not an outside connector, so she needs her own revoke switch.
4. Viewing is its own permission. It can never modify, build, spend or delete.

## Verified (evidence)

- Real Chromium preserves what the redraw loses (3-D, frosted panels, hover) — fixture experiment.
- Fixture captures: desktop, mobile, full-page, open bubble; field values hidden (re-checked 10 Oct: a field containing a test value is absent from the picture).
- Refusals in real Chromium (10 Oct): sign-in page, redirect to another room, 404 and empty page each exit 3 and save nothing.
- Unit tests: 39 pass; new files typecheck clean in a scratch install.

## NOT verified / untested

- Any capture of the live Office (needs John's sign-in and authenticator).
- Any assistant receiving or describing an image: Claude, ChatGPT, Elsie, external Claude and external ChatGPT are **all untested**. Whether the ChatGPT and Claude connectors pass an image block to the model is unknown.
- Browser-closed operation. Signed-out refusal on a real endpoint.
- The database changes (no Postgres here). Full project typecheck, lint and build (dependencies would not install from the lockfile's registry).
- Independent ChatGPT review (the relay spends Office budget; needs approval).

## Per-assistant matrix

| Assistant | Live image | Brief / skills | Narration | Follow-ups | Browser closed | Revocable alone |
|---|---|---|---|---|---|---|
| Claude (this session) | untested | text records only, brief tool not built | untested | untested | untested | design only |
| Claude (external) | untested | untested | untested | untested | untested | design only |
| ChatGPT (external) | untested | untested | untested | untested | untested | design only |
| Elsie | untested | untested | untested | untested | untested | not built |

Per room: all 24 are covered by the rulebook and the drift test; **0 of 24 verified live** for any assistant.

## Security review (self-review; independent review still needed)

- No password, session, MFA bypass or admin credential is shared. Sessions are short, single-use and narrow.
- RLS stays as is: the restrictive OAuth policy keeps assistant tokens away from tables; access remains through definer functions.
- Captures: private storage only, never repository, Actions log or public artifact. Fields hidden before capture; `data-canx-no-capture` honoured.
- Risk: a server minting owner-level sessions is the sensitive part. Needs an independent reviewer before any deploy.
- Risk: screenshots of two-step rooms contain sensitive data; hence the time-boxed window and audit.
- Risk: page content shown to an assistant is data, not instructions.

## Progress log

- Done: investigation, design, rulebook, capture script, access rules, result builder, room briefs, tests, draft PR.
- Bottlenecks: no linked computer for John's signed-in session; lockfile registry blocked; no database server here.
- Remaining (needs approval in this order): workflow and secrets, session issuing function, migration for `office-view-v1` and storage, connector tools, Elsie switch, then the live per-assistant, per-room tests and an independent review.

## What John needs to do (smallest steps)

1. Decide whether to approve the design in `docs/room-capture-design.md`.
2. Approve each protected change by name, and any spending or deployment.
3. To test with his real session: open this chat in the Claude desktop app and choose "Link to this computer".
