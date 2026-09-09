# Office Manager — connection status and setup notes

Last updated with the CanX Office build that added the Office Manager, the brain map, and the Monday round table draft.

## What is actually live right now

| Feature | State |
| --- | --- |
| Office rooms, brain map, search, simple view, guided tour | Live in this app |
| Appearance preview / Apply / Undo | Live, **saved on this device only** |
| Saved tasks and decisions | Live, **saved on this device only** |
| Monday round table draft (edit, save, reload, export, import) | Live, **saved on this device only** |
| Office Manager chat with a real AI | **Blocked — fail closed.** No owner sign-in with MFA exists, so no paid call is made even if a key is present |
| Database, logins, owner MFA, shared records | **Blocked** — no CanX-owned backend is connected |
| Lovable AI Gateway path | **Removed.** The gateway execution fallback no longer exists in the code |
| Safe Highways / Trail Tales live data | **Not connected, and deliberately untouched** |
| Email, messaging, payments, deployment, scheduled jobs | **Not built** |

Sample office records are labelled demonstration data. Records John saves himself carry their own provenance and are not called demonstration data. The office never claims live status, live performance, or completed external work.

## Adding a key does NOT turn the AI on

This is the important correction. Earlier notes said that setting two secrets switched the manager on. That was wrong and is no longer true of the code.

The adapter fails closed. Before any request leaves the server it checks for a verified owner session. There is no such session today, so it returns `auth_not_ready` and makes **no** upstream call. There is deliberately no environment flag that bypasses this.

Status wording you will see:

- **AI not connected** — no owner sign-in with MFA exists.
- **AI blocked — key present but unverified** — a secret exists but cannot be used.
- **AI configured but unverified** — a key exists and auth is ready, but no live health check has passed.
- **AI connected** — only after verified owner authentication *and* a passing live health check.

## What must be true before live activation

All of these, in order — secrets are the last step, not the first:

1. A CanX-owned backend with authentication (recommendation: a CanX-owned Supabase project; not created).
2. An owner account with MFA (TOTP) enrolled, and server-side enforcement that the session is `aal2` with the `owner` role. See `docs/backend-schema.sql` — that file is **reference only and unapplied**; it does not implement authentication.
3. Request-rate limits per session and per day, enforced on the server.
4. A spending limit with a hard stop, plus recorded usage, so cost cannot run away unattended.
5. A real provider health check whose result marks the connection verified. Secret presence must never be treated as a connection.
6. Only then: `OPENAI_API_KEY` (CanX-owned account) and optionally `OPENAI_MODEL`, held as server secrets, never in the browser.

### Ownership note on the alternative

Running through the Lovable AI Gateway would put the account, key and bill in the Lovable workspace rather than in CanX's name, and rebuilding outside Lovable would mean re-pointing the adapter anyway. The execution path for it has been removed from the code; if it is ever wanted, it is a decision to make deliberately, with the same authentication and spend controls above.

## Bounds on the manager

- One request per message. No background loops, no scheduled runs, no self-triggered work.
- Two tools only: preview an allowlisted appearance setting, and propose a task or decision for John to save.
- It cannot run code, change files, deploy, send anything, spend anything, or reach another project.
- It cannot speak as Claude or as any reviewer that has not been verified and connected.

## Backend — still undecided, nothing provisioned

No backend has been enabled. The recommendation on the table remains a **CanX-owned Supabase project**, which has not been created yet. Nothing in this build silently substitutes a managed alternative.

Until that decision is made, the round table draft, saved tasks, and appearance settings live in this browser only. Clearing site data clears them; use Export on the round table page to keep a copy.

The proposed schema, row-level security, and owner-MFA notes are in `docs/backend-schema.sql`. That file is reference only and has not been applied anywhere.
