# CanX Office — setup guide (database, sign-in, AI)

Written for John. The office refuses to do anything paid or private until every
step below is genuinely complete and checked.

**Database project:** CanX Office, ref `gmsjjiprtulxojhkmbqb`, created by John in
the **canericaextreme** Supabase organization, Canada Central, Data API on,
automatic exposure of new tables OFF, automatic RLS ON.

**Current state: migrations not applied, no sign-in, no AI.**

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

## Step 1 — run the three database files

Open the SQL editor of the CanX Office project and run these in order, from
this repository:

1. `docs/migrations/0001_canx_office_core.sql`
2. `docs/migrations/0002_ai_limits.sql`
3. `docs/migrations/0003_finance_receipts.sql` (private receipts storage)

They create the tables, the access rules, the append-only history, and the
spending-limit machinery. Because automatic exposure of new tables is off,
every grant these files need is written into them by name; nothing is granted
to anonymous visitors anywhere. Running them does **not** create sign-in and
does **not** enable AI.

## Step 2 — give the office the publishable key

The office already holds the project URL. It still needs the **publishable**
key (the public one, safe in a browser — never the service-role key, which the
office neither wants nor uses).

Copy it from the project's API settings, then add it in **Project Settings →
Secrets** under this exact name:

| Name | Value |
| --- | --- |
| `CANX_SUPABASE_PUBLISHABLE_KEY` | the project's publishable key |

Nothing else is needed for sign-in to become available.

## Step 3 — create the owner account and make it the owner

Create the account (email and password) in the Supabase dashboard. Proposed
email: `canericaextreme@gmail.com` — confirm or change it at that point. Choose
and store the password yourself; the office never creates, holds, or shows it.

Then run this once in the SQL editor, with the email you used:

```sql
insert into public.user_roles (user_id, role)
select id, 'owner' from auth.users where email = 'you@example.com';
```

The owner role can only be granted this way. The office cannot grant it to
itself, and no browser action can.

## Step 4 — turn on two-step verification

Sign in from the Systems room, then choose **Set up an authenticator app**,
scan the code, and enter a six-digit code to finish. Do this yourself; the
office never enrols an authenticator on your behalf.

**About recovery, stated accurately:** Supabase does not issue printed recovery
codes for an authenticator factor. If you lose the authenticator, the supported
recovery route is the project dashboard: an administrator of the Supabase
project deletes the MFA factor for that user (Authentication → Users), after
which you sign in with email and password and enrol a fresh authenticator. That
means whoever controls the Supabase project can restore access — so protect the
Supabase account itself, and consider enrolling a second authenticator device.

Sign-in without two-step verification is treated as not signed in.

## Step 5 — spending limits, only when a real budget is allocated

The numbers in `0002_ai_limits.sql` are illustrative defaults in reference SQL.
They are **not** an approved allocation, and they are not John's $500 monthly
total running-cost ceiling — that ceiling is CAD (working assumption), covers
all office running costs together, is not per provider, and is separate from
build credits.

No AI budget has been allocated yet, so no limits row should be inserted yet.
When a real allocation is decided, insert it deliberately:

```sql
insert into public.ai_limits (owner_id, max_calls_per_minute, max_calls_per_day, max_cents_per_day, max_cents_per_month)
select id, <calls_per_minute>, <calls_per_day>, <cents_per_day>, <cents_per_month>
from auth.users where email = 'you@example.com';
```

No limits row means no agreed budget, which means every paid call is refused.

## Step 6 — only after all of the above, the AI key

| Name | What it is |
| --- | --- |
| `OPENAI_API_KEY` | Your own OpenAI key. Server only. |
| `OPENAI_MODEL` | The exact model you choose. No default is guessed. |

The office picks no model for you and never claims a model is "the latest".

## Step 6b — optional: Claude "second eyes" (Anthropic)

Claude is a separate, independent reviewer. It never replaces the Office
Manager, never answers ordinary office chat, and cannot authorise a build or
any spending. It passes exactly the same gates as the manager: owner sign-in,
two-step verification, a durable spending and rate reservation, and a live
authenticated check of the Anthropic connection.

Add these in **Project Settings → Secrets**. Never paste a key into the Lovable
chat, and never into a file:

| Name | What it is |
| --- | --- |
| `ANTHROPIC_API_KEY` | Your own Anthropic key. Server only, never sent to the browser. |
| `ANTHROPIC_MODEL` | The exact Anthropic model you choose. Left unset on purpose — the office will not guess one. |

Until both exist, the Systems room shows Claude as not connected. A key on its
own changes nothing: "verified" appears only after a real authenticated call to
Anthropic succeeds.

## Step 7 — check it in the office

Open the **Systems** room. Each line says configured, verified, or blocked, and
gives the reason. "Verified" appears only after a real successful call.


---

## Backups, export, restore

- Supabase takes automatic backups on its paid plans; confirm what your plan
  actually includes before relying on it.
- Take your own export as well: `pg_dump` from the project's connection string,
  kept somewhere you control.
- Restore by creating a fresh project, running the three migration files, then
  restoring your dump.
- **None of this is tested yet.** Test a real restore before treating any of it
  as a backup.

## What stays out

- No Lovable Cloud provisioning, and no managed backend substituted quietly.
- No mailbox, messaging, payments, or scheduled jobs.
- No connection to Safe Highways or Trail Tales.
- Outside AI assistants (agent integrations) stay switched off: the only
  offered mode is anonymous public access, which John declined.
