# Standing authorization repair — owner-approved scope (28 Oct 2026)

## Owner direction
Routine, reversible CanX Office work should proceed without repeated approval prompts. This includes ordinary code repairs, tests, filing and minor improvements. Maintain an audit trail and report outcomes. Explicit owner review remains mandatory for spending, subscription changes, legal commitments, destructive changes, material security/permission changes, and major operational or architectural risks. Unknown risk requires review.

## Verified problem
The Office build submission currently rejects a request to adjust its own approval classification as protected; this is a real enforcement boundary, not a missing conversational approval. The merge robot's policy already permits routine changes with an opt-in label, green CI and independent review, but protected paths (including automation/security policy) correctly require owner review. Do not bypass this boundary by changing file names or splitting a risky change.

## Implementation checklist
1. Trace the server-side submit_office_build risk classifier and owner-approval grant verification, and the merge robot's protected-path gate. Document where conversational owner approval differs from recorded grant.
2. Add a legitimate authenticated owner decision path for protected changes, recording scope, identity, expiry, and audit trail; do not treat assistant text as a grant. Keep routine work automatically authorized under existing allowlisted permissions.
3. Permit routine draft builds and their tested, independently reviewed PRs to merge automatically when all checks and branch protections pass; preserve protected-change manual owner review. Never auto-publish a protected change merely because its tests passed.
4. Verify normal/blocked cases with tests: routine fix accepted; legal/spend/security change queued for owner; explicit owner decision honored once; denied request blocked; missing/expired grants blocked; no duplicate submissions; audit trail retained.
5. After authorized deployment, test Elsie's 2–3 second greeting target, 6 a.m. America/Dawson_Creek Office/email scan with accurate mailbox coverage, and concise green/yellow/red spoken briefing. Report measured results, not claims.

Related: issue #142 and docs/continuous-execution-automerge-policy.md. This document is a draft implementation brief, not a deployed change or grant.
