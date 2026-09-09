# Office Manager — connection status and setup notes

Last updated with the CanX Office build that added the Office Manager, the brain map, and the Monday round table draft.

## What is actually live right now

| Feature | State |
| --- | --- |
| Office rooms, brain map, search, simple view, guided tour | Live in this app |
| Appearance preview / Apply / Undo | Live, **saved on this device only** |
| Saved tasks and decisions | Live, **saved on this device only** |
| Monday round table draft (edit, save, reload, export, import) | Live, **saved on this device only** |
| Office Manager chat with a real AI | **Blocked** — no CanX-owned AI key is configured on the server |
| Database, logins, owner MFA, shared records | **Blocked** — no CanX-owned backend is connected |
| Safe Highways / Trail Tales live data | **Not connected, and deliberately untouched** |
| Email, messaging, payments, deployment, scheduled jobs | **Not built** |

Every record shown in the office is labelled demonstration data. The office never claims live status, live performance, or completed external work.

## Turning the Office Manager's AI on (OpenAI, CanX-owned)

The preferred route keeps the account and the bill in CanX's own name. The key is read on the server only and is never sent to the browser.

Add these as project secrets (Project Settings → Secrets), then reload the app:

**Server secrets — COPY AND PASTE (names only; paste your own values)**

```text
OPENAI_API_KEY
OPENAI_MODEL
```

- `OPENAI_API_KEY` — a key from a CanX-owned OpenAI account.
- `OPENAI_MODEL` — optional. Defaults to `gpt-4.1-mini` if unset.

Once set, the manager panel shows "AI connected — OpenAI". Until then it says plainly that it is not connected, and it never invents a reply.

### The alternative, and its trade-off

The app can also run through the Lovable AI Gateway. That path is **off** unless `CANX_AI_GATEWAY_ENABLED=true` is set deliberately.

- Ownership: the gateway account and key belong to the Lovable workspace, not to CanX.
- Cost: usage is billed as Lovable credits rather than to a CanX account.
- Portability: rebuilding outside Lovable would mean re-pointing this adapter at a CanX-owned provider.

It is offered as a fallback, not as the recommendation.

## Bounds on the manager

- One request per message. No background loops, no scheduled runs, no self-triggered work.
- Two tools only: preview an allowlisted appearance setting, and propose a task or decision for John to save.
- It cannot run code, change files, deploy, send anything, spend anything, or reach another project.
- It cannot speak as Claude or as any reviewer that has not been verified and connected.

## Backend — still undecided, nothing provisioned

No backend has been enabled. The recommendation on the table remains a **CanX-owned Supabase project**, which has not been created yet. Nothing in this build silently substitutes a managed alternative.

Until that decision is made, the round table draft, saved tasks, and appearance settings live in this browser only. Clearing site data clears them; use Export on the round table page to keep a copy.

The proposed schema, row-level security, and owner-MFA notes are in `docs/backend-schema.sql`. That file is reference only and has not been applied anywhere.
