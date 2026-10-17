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
