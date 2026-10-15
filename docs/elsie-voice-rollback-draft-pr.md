# Restore Elsie before the handoff repairs

John reported that interruption and conversation continuity had regressed, and requested restoring the last working behavior before the handoff changes.

The first builder attempt (run 38675160450) only wrote a blocker report because its shallow checkout lacked the baseline. That report did not implement a rollback. The follow-up recovered the actual baseline locally. All source files changed by PRs 102 and 103 are restored exactly to e10dd95eba587f449c82f6aa785b07a8dcafbd1b, including OfficeManager, the realtime hook, manager adapter and task executor. The new manager-handoff helper and its tests are removed. Corresponding existing tests are restored to the baseline.

This is a forward rollback commit, with no history rewrite. Existing records, conversation storage, credentials, grants, budgets, workflows and unrelated room/visual work are retained. No new handoff redesign is included. The previous source behavior is restored; this does not prove the reported memory problem is resolved.

After publication, owner acceptance must test: several spoken turns, interruption, closing with X then reopening and continuing the conversation, and room awareness. Builder handoff remains deferred until this baseline is confirmed. Automated test passes are not real-device verification.

Validation before publication: all 1,614 tests across 159 files passed, typecheck and production build passed, and git diff --exit-code e10dd95 -- src/ confirms identical source. Signed-in acceptance remains pending.
