# Elsie 10-hour runner operational rollout — phase 4
The GitHub workflow in this PR schedules a five-minute poll, but **is disabled by default**. Do not set `ELSIE_WORKER_ENABLED=true` until all of these are true:
1. The secure `elsie-extended-worker` Supabase Edge Function is deployed, tested, bound to one project, using a narrowly scoped service credential. Do not reuse user MFA/session JWT or broad admin token in the Actions secret. There is **no such function in this PR**.
2. The session tables and audit event migrations are applied and RLS/RPC reviewed. They are not installed as of this PR.
3. Only a current owner-authorized, revocable extended-work grant permits a poll to claim a green queued task. The server must authenticate itself and verify owner, session, expiry, lease and expected task.
4. Cost upper bounds, daily/remaining provider balance and outstanding reservations must be read from authoritative accounting records, atomically reserve the next build amount, and compare with monthly caps before any dispatch. Unknown data means stop.
5. No duplicate runs across crashes/timeouts: lease and idempotent claim, one active build per builder; do not retry an uncertain response.
6. Owner can stop work without waiting for another 5-minute poll; prevent future dispatch immediately. GitHub cron may be delayed or skipped and is not a guaranteed real-time service.
7. End-to-end test on a green low-cost fixture using a dry-run dispatch, revoke grant, fail budget, expire session and verify no unauthorized API charges.
8. Owner approves merge and production activation separately. When off, the scheduled job only prints a message and exits.

This code does not autonomously execute tasks yet. Its value is establishing a bounded and testable schedule hook without weakening the existing manual Elsie queue. Keep the existing Office and Finance unchanged.

## Candidate implementation — 20 October 2026 (PR #181; NOT ACTIVATED)

The held migration `20261020010844_elsie_worker_ledger_candidate.sql` adds durable scoped sessions,
queued jobs, audit events, one global active slot per builder, atomic leases and budget reservations.
The server tick is `src/lib/elsie-worker-runtime.server.ts`; the authenticated HTTP boundary is
`src/lib/elsie-worker-edge.server.ts`. The Edge entry is under `supabase/functions/elsie-extended-worker`.
None of these are installed in production. The migration's `-- canx:hold` marker prevents automatic
installation, including after a later merge. Existing function auto-deployment does not include this worker.

The owner enrolls exact existing green, queued Work Board task IDs through the MFA-only
`elsie_worker_enroll` RPC. Builder selection is copied from those owner-approved task assignments;
this worker does not change routing. Enrollment lasts at most ten hours and caps total USD cents.
`elsie_worker_stop` revokes further dispatch immediately at the database admission boundary. A provider
request already committed cannot be recalled by revoking enrollment; its reservation and receipts remain.
No automatic retry follows dispatch uncertainty, even after lease expiry or a replacement process.
Task receipts use the existing `office-task-v2` format before outbound dispatch, so the interactive
executor also refuses a second paid attempt. A successful build waits for independent review and guarded
release; this worker does not merge, deploy, publish, or mark a task Done.

The separate server credential must be a signed, expiring `elsie_worker` role JWT with one `elsie_session`
claim. It has no table privileges and only five worker RPC capabilities. It is **not** an owner's
access token, an MFA code, password, or a service-role/admin key. Session enrollment and service-credential
expiration are independent: a stopped/expired enrollment may still reconcile its existing run receipts,
but cannot dispatch. Credential issuance/rotation and secret installation require the protected security
review; no credential values belong in this document or repository.

Paid dispatch remains blocked unless a separately reviewed authoritative accounting adapter supplies
fresh USD-denominated provider balance evidence and an enforced per-run upper bound. There is deliberately
no browser or worker write path to `elsie_provider_evidence`. Codex is additionally blocked in the runtime
because its existing workflow has no enforced per-run spending ceiling. Claude uses the current runner's
`max_budget_usd` enforcement; the accounting adapter must attest that the existing Office cap uses the same
USD units. A missing, stale or untrusted balance does not become an estimate. The migration does not seed
a balance, spending permission, enrollment, or queued task.

Build the self-contained Edge bundle without deploying:

```sh
node tests/elsie-worker/bundle.mjs /tmp/canx-worker-edge-bundle
```

The bundle includes the fixed Office protected-action classifier. Deploying would require the reviewed
bundle, `ELSIE_WORKER_ENABLED`, `ELSIE_WORKER_DB_JWT`, a random service poll token of at least 32 characters,
and the existing private GitHub connection. The handler is bound to the single Office project and accepts
only `{ "mode": "poll" }`. It never accepts a task, owner, builder, cost, credential, or permission from
an inbound request. Its own bearer-token authentication protects the polling endpoint; do not make it
public without that authentication. Keep the GitHub scheduler disabled until the live acceptance test.

Development evidence:
- TypeScript runtime fault tests cover one dispatch, timeout/restart, lost receipt persistence, revocation,
  protected requests, foreign run identity, active builders, unbounded Codex costs and HTTP authentication.
- Disposable PostgreSQL tests execute the real held migration: direct owner MFA, scoped role privileges,
  absent balance, atomic claim/attempt, revocation, Work Board/Brain receipts, progression, task changes,
  database uniqueness, expired leases, spending reservations and replacement-process persistence.
- Run SQL tests with PGlite **0.5.10** installed outside the repository (no app dependency change):
  `CANX_PGLITE_MODULE=/path/to/pglite/dist/index.js node --test tests/elsie-worker/ledger.nodetest.mjs`.
- These tests are not hosted Supabase/PostgREST, distributed multi-connection, or unattended live proof.

Remaining release gates: independent security review of the exact candidate; scoped credential provisioning;
signed-in acceptance of the prepared Build & Testing enrollment/stop controls; authoritative accounting adapter and enforced Codex
cost limit for paid Codex tasks; live negative/fault tests; then the required previously authorized test with
the ChatGPT conversation closed. The unattended acceptance test has **not** passed. No scheduler setting,
GitHub secret, production schema, provider credential, or live Office permission was changed for this work.

Because a newer production migration may already be recorded, removing the hold later does not by itself
apply this older filename. After approval, use the existing migration workflow's explicit filename input;
its held-file check must first be deliberately removed in the reviewed release. Do not rewrite live
migration history or manufacture a newer timestamp to evade that gate.

Owner controls are prepared in `ElsieWorkerControls` in Build & Testing, backed by a fixed-action server
function and MFA-only status/enroll/stop RPCs. Reading status does not enroll or enable anything. The
owner reviews the exact tasks, expiration and USD ceiling before authorizing. Stop remains a direct
button for each enrollment. Fixture tests cover the visible review and Stop paths; no signed-in live
acceptance is claimed. Supabase's current custom-role and JWT documentation was checked for the role
switching design: https://supabase.com/docs/guides/storage/schema/custom-roles and
https://supabase.com/docs/guides/auth/jwts. No signing key or worker credential was created or read.
