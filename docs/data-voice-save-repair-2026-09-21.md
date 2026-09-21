# Data voice and conversation save repair — 21 September 2026

## Confirmed faults

- The live CanX Office database allowed authenticated INSERT on manager_changes but did not grant USAGE on its bigserial sequence. Conversation saving through the owner's token could not allocate a record id. At inspection the table contained zero manager_conversation events.
- The owner-session listener ignored TOKEN_REFRESHED, leaving consumers with an old access token after automatic renewal.
- The voice startup catch merged microphone, office-server and live-voice connection failures into a microphone-permission warning.
- Every provider error ended voice, including recoverable command conflicts.

## Applied repair

- Granted only USAGE on public.manager_changes_id_seq to authenticated in the existing CanX Office database. Recorded the required grant in the existing setup SQL. No table, policy, content or anonymous grant was changed.
- Reverified sequence permission: authenticated=true, anon=false; table RLS=true. Verified that existing SELECT/INSERT policies require the authenticated owner and is_verified_owner().
- Propagated refreshed auth tokens through server owner verification; deferred refresh outside the auth callback and discarded stale verification results, including after sign-out.
- Preserved displayed conversation turns on token renewal. Added a serial in-memory outbox: failed saves remain pending and retry on a new turn, token renewal, network restoration or the Retry saving conversation button. Message IDs are reused by the existing server deduplication check. Saves never replay office actions. Pending data is cleared on account change/sign-out and does not survive a page reload; the page warns before leaving with pending messages when supported by the browser.
- Distinguished microphone denial/device errors, office-server errors, HTTP voice rejections and network errors. Raw provider payloads and secrets are not displayed.
- Kept the current voice connection for active-response conflicts, cancellation of an inactive response and empty audio commits. Unknown/fatal failures still stop voice safely. No automatic paid-session restart or action replay was added.

## Verification

- TypeScript check passed.
- 517 tests passed across 38 files. New regression coverage includes token renewal outside the auth callback, stale verification after sign-out, failed saves with renewed credentials, serialized saves, account changes, recoverable voice errors, and separate microphone/HTTP errors.
- Production build passed. Existing framework deprecation warnings remain.
- The live database permission and RLS checks passed; no synthetic user conversation was inserted and no paid AI call was made.
- Physical Android microphone/speaker output, live provider availability, and an end-to-end owner-authenticated conversation remain unverified. These changes do not prove the exact cause of the earlier voice service failure because the old code discarded that error.

## Sources and separate findings

- Supabase auth events: https://supabase.com/docs/reference/javascript/auth-onauthstatechange
- Supabase changelog checked for relevant hosted-auth breaking changes: https://supabase.com/changelog
- The database advisor also reported existing SECURITY DEFINER function exposure warnings (including anonymous access for ensure_manager_ai_budget, log_manager_change, manager_budget_status and rls_auto_enable), and disabled leaked-password protection. These were not changed as part of this focused voice repair. They need a separate function-body/permission review, not a blanket revoke that could break office actions.
- Advisor guidance: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- Password guidance: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
