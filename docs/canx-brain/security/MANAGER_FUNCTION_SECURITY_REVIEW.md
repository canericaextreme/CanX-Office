# Manager Function Security Review

**Scope:** three security-definer functions created by migration `0005_manager_workbench.sql`:

- `public.manager_budget_status(_owner_id uuid)`
- `public.ensure_manager_ai_budget(_owner_id uuid)`
- `public.log_manager_change(_owner_id uuid, _action text, _entity text, _entity_id text, _before jsonb, _after jsonb)`

**Evidence date:** 2026-09-11  
**Supabase project reference:** `gmsjjiprtulxojhkmbqb` (public host identifier only; no credentials are recorded here).

## Findings

### 1. Anonymous access to `manager_budget_status` was exposed

A read-only, unauthenticated probe of the live CanX Supabase database on 2026-09-11 confirmed that `public.manager_budget_status(uuid)` returned **HTTP 200** and exposed the spend-status result shape (`used_cents`, `ceiling_cents`, `warn_cents`, `paused`, `warning`) without any owner identity, AAL2, or session verification.

### 2. Root cause: PostgreSQL defaults `EXECUTE` to `PUBLIC`

When a function is created, PostgreSQL automatically grants `EXECUTE` to `PUBLIC` unless it is explicitly revoked. Migration `0005_manager_workbench.sql` granted `EXECUTE` to `authenticated` and `service_role`, but it did **not** revoke `PUBLIC` first. As a result, anonymous callers inherited execute access.

### 3. Additional flaw: missing ownership/AAL2 guard in `manager_budget_status`

Even after the `PUBLIC` grant is removed, the original `manager_budget_status` implementation did not verify that the caller's `auth.uid()` matched the requested `_owner_id` or that `public.is_verified_owner()` returned true. Any authenticated caller could potentially request another owner's budget totals.

`ensure_manager_ai_budget` and `log_manager_change` already contain internal owner/AAL2 guards, but their public execute surface should still be closed to `PUBLIC` and `anon` to follow the principle of least privilege.

## Proposed Fix

The exact proposed SQL is in:

[`manager_function_hardening_DESIGN_ONLY.sql`](./manager_function_hardening_DESIGN_ONLY.sql)

It does four things:

1. Replaces `public.manager_budget_status` so it returns data only when:
   - the caller is `service_role`, **or**
   - the caller's `auth.uid()` equals `_owner_id` **and** `public.is_verified_owner()` is true.
2. Revokes `EXECUTE` on all three functions from `PUBLIC`.
3. Revokes `EXECUTE` on all three functions from `anon`.
4. Re-grants `EXECUTE` to `authenticated` and `service_role`.

This proposal:

- **Does not apply migration `0004`** or **`0007`**. Both remain unapplied and outside this scope.
- **Depends on the functions already existing from migration `0005`**.
- **Requires John's separate explicit approval** before any database execution.

## Validation Plan (after separately approved application)

Run these checks in a safe test session:

- `anon` role: denied on all three functions.
- Authenticated role at AAL1: denied on `manager_budget_status` when calling with own UUID.
- Authenticated role at AAL2: succeeds on `manager_budget_status` with own UUID; denied with a different owner's UUID.
- Manager budget/task flows continue to pass for an AAL2 owner.
- `service_role` behavior remains functional.
- `information_schema.routine_privileges` shows no `EXECUTE` row for `grantee` = `PUBLIC` or `anon` on these functions.

## Rollback

The rollback source is the original `0005` definition at commit `896cce2e459dd4a73136a21197dad505b42e4641`. Restoring the insecure state is **not recommended** except under an approved incident-rollback process.

## Scope Limitations

This review covers only the three Manager functions above. It is **not** a full audit of every security-definer function in the CanX database. A later read-only privilege review of all `security definer` functions and `routine_privileges` is recommended.

## Status

**Not applied.** No database change, migration, code change, secret change, connector change, or deployment has occurred as part of this review.
