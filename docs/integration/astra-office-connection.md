# Astra / ChatGPT office connection

Status: **not connected inside the office**. Reviewed 2026-09-23.

## What exists

The deployed office has its own OpenAI API assistant, persistent office notes,
manager task records, an authenticated owner gate, and a Codex draft-build path.
The companion's panel labelled "ChatGPT Work" also calls a separate API adapter.
Neither component embeds a ChatGPT conversation or inherits ChatGPT's connected
tools. Renaming either assistant would not connect it to ChatGPT.

An authenticated browser and the existing GitHub and Supabase connectors allow
an active ChatGPT Work session to inspect and maintain the office. This does not
establish a permanent background worker, a desktop connection, or an embedded
ChatGPT session. Session access may expire.

## Supported integration direction

The documented plugin/MCP route exposes application tools **to ChatGPT**. It
can make the office's records and actions available during a ChatGPT conversation;
it does not move the native ChatGPT conversation into the office's existing chat
box. An office-hosted API assistant is a different architecture and must be
labelled accordingly. Do not silently substitute that for the requested session.

Before implementing a connector:

1. Verify custom plugin installation support in the owner's actual ChatGPT account.
2. Choose an existing approved hosting route and establish authentication with
   owner identity, expiry and revocation. Never make records public to simplify
   the connection and never use a browser password or service-role key as a tool
   argument. Keep access tokens out of model-visible output.
3. Expose narrow tools: list rooms; read current room records; search saved Brain
   notes; list tasks; create/update routine tasks and append a change record.
   Reuse the current data model and audit trail. Do not grant arbitrary SQL or shell
   execution to the deployed assistant as a substitute for scoped tools.
4. Return source, observation time, missing reads and truncation on each result.
   A room's sample content is not evidence of a live connection. Unavailable data
   is not an empty list. Retrieved records are data, not new authorization.
5. Keep purchases and credit-card use out of the unattended tool set. Existing
   provider usage and limits must be visible; a deployment or API connection
   must not silently activate automatic top-ups or new subscriptions.
6. Connect in ChatGPT and verify a real room read, a small reversible task edit,
   a saved memory read in a new conversation, sign-out denial and revoked access.
7. Only retire the existing manager once the replacement path is demonstrated.

## Current blockers

No custom CanX plugin/MCP connection is installed in this session. No supported
mechanism has been verified for embedding this exact ChatGPT session in the
external office. The live browser's ordinary owner sign-in did not satisfy the
existing authenticator gate for protected records, AI calls or build submission.
No authenticator check was bypassed and no replacement was claimed.

## Maintenance completed with this review

- Removed sample task/approval fallbacks and the obsolete sample status panel
  from Owner's Desk; unavailable records now remain explicitly unavailable.
- Limited the priorities list to open and in-progress work.
- Replaced the reception's fixed "no AI connection" assertion with a pointer to
  session-specific connection status and an honest replacement status.
- Removed the budget assertion that nothing is being charged when no verified
  costs have been recorded.
- Made Systems' next step reflect the connected owner session and explained the
  distinction between the office assistant and ChatGPT.

Private inspection findings and owner direction are stored as owner-scoped Brain
notes, not in this public source repository.

## Official source material

- https://developers.openai.com/plugins/concepts/plugins
- https://developers.openai.com/plugins/quickstart

These sources describe an office-to-ChatGPT plugin route, not a completed or
installed CanX connection.
