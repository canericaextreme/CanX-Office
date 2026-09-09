# CanX Office — setup guide (database, sign-in, AI)

Written for John. Nothing in this file has been done for you. The office is
built so that it refuses to do anything paid or private until every step below
is genuinely complete and checked.

**Current state: no database, no sign-in, no AI. All of it is blocked, on
purpose.**

---

## Why the office refuses

Adding an AI key on its own does **not** switch anything on. Before the office
makes a single paid AI call it checks, on its own server, all of the following:

1. A CanX-owned database is configured.
2. The request carries a real, unexpired session for that database.
3. That account holds the **owner** role, read from the database — never from
   the browser.
4. The session passed two-step verification (an authenticator app).
5. A spending and request-rate reservation was granted by the database.
6. A live, authenticated check of the AI connection passed just now.

If any one of those fails, the answer is no. There is no setting, flag, or
back door that skips them.

---

## Step 1 — create the CanX-owned database

Open the connectors page and choose Supabase:

https://lovable.dev/dashboard?connectors

Create the project inside **your own** account. This matters: CanX owns the
account, the data, the backups, and the exports, and can rebuild elsewhere.

## Step 2 — run the two database files

In the Supabase SQL editor, run these in order, from this repository:

1. `docs/migrations/0001_canx_office_core.sql`
2. `docs/migrations/0002_ai_limits.sql`

They are **not applied**. They create the tables, the access rules, the
append-only history, and the spending limits. Running them does **not** create
sign-in and does **not** enable AI.

## Step 3 — make your account the owner

Create your account (email and password) in the Supabase dashboard, then run
this once in the SQL editor, replacing the email:

```sql
insert into public.user_roles (user_id, role)
select id, 'owner' from auth.users where email = 'you@example.com';
```

The owner role can only be granted this way. The office cannot grant it to
itself, and no browser action can.

## Step 4 — turn on two-step verification

Sign in from the Systems room, then choose **Set up an authenticator app**,
scan the code, and enter a six-digit code to finish. Store your recovery codes
offline, in a safe place. If you lose both your phone and your recovery codes,
you lose the account — nobody can restore it for you.

Sign-in without two-step verification is treated as not signed in.

## Step 5 — set your spending and rate limits

Before any AI is allowed, insert your limits (service role, SQL editor):

```sql
insert into public.ai_limits (owner_id, max_calls_per_minute, max_calls_per_day, max_cents_per_day, max_cents_per_month)
select id, 6, 200, 500, 5000 from auth.users where email = 'you@example.com';
```

No limits row means no agreed budget, which means every paid call is refused.

## Step 6 — only now, add the AI key

Set these on the server (Project Settings → Secrets). Never in the browser,
never in the code:

| Name | What it is |
| --- | --- |
| `CANX_SUPABASE_URL` | Your Supabase project URL |
| `CANX_SUPABASE_PUBLISHABLE_KEY` | Your Supabase publishable key |
| `VITE_CANX_SUPABASE_URL` | Same URL again, for the sign-in screen |
| `VITE_CANX_SUPABASE_PUBLISHABLE_KEY` | Same publishable key again |
| `OPENAI_API_KEY` | Your own OpenAI key. Server only. |
| `OPENAI_MODEL` | The exact model you choose. No default is guessed. |

The office picks no model for you and never claims a model is "the latest".

## Step 7 — check it in the office

Open the **Systems** room. Each line says configured, verified, or blocked, and
gives the reason. "Verified" appears only after a real successful call.

---

## Backups, export, restore

- Supabase takes automatic backups on its paid plans; confirm what your plan
  actually includes before relying on it.
- Take your own export as well: `pg_dump` from the project's connection string,
  kept somewhere you control.
- Restore by creating a fresh project, running the two migration files, then
  restoring your dump.
- **None of this is tested.** There is no CanX-owned account yet to test it on.
  Test a real restore before treating any of it as a backup.

## What stays out

- No Lovable Cloud provisioning, and no managed backend substituted quietly.
- No mailbox, messaging, payments, or scheduled jobs.
- No connection to Safe Highways or Trail Tales. Those remain untouched, and
  are planned as read-only later, if ever.
- The accounts verified in ChatGPT on 9 September 2026 are a record only. The
  Office Manager here cannot see or use any of them.
