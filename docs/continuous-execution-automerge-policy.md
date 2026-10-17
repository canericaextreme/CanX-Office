# CanX Office — Continuous execution and controlled auto-merge policy

Implemented by the CanX merge robot: see docs/canx-merge-robot.md.

Owner direction: a previously authorized task must be driven through building, verification, eligible merging, deployment, and outcome reporting without asking the owner to repeatedly say "continue." This policy is intended to be implemented in Elsie's authoritative operating rules and the Office's persistent task runner. A text policy alone does not implement runtime automation.

## Autonomous default
- Persist a durable task ID, owner authorization scope, builder assignment, current state, next action, and last verified outcome.
- Follow the task through the complete workflow while it remains within previously authorized scope, including retries for recoverable failures.
- After session termination, a server-side worker/job must resume queued tasks; a browser chat session must not be assumed to stay active.
- Notify the owner of significant progress and outcome; do not substitute status-only messages for work.
- Stop or seek owner review for expenditure/subscription commitments, legal decisions, major Office architectural/security/permission changes, destructive operations, or unresolvable blockers. Unknown risk defaults to review.
- Explicit owner cancel/stop is binding; do not continue canceled work.

## GitHub merge and deploy
- For allowlisted routine low-risk changes: create PR, run required CI/security/regression checks, satisfy independent review and branch protections, request auto-merge, then verify merge.
- Never merge when checks fail, reviews are outstanding, conflicts exist, or protection rules would be bypassed.
- Configure repository auto-merge and a least-privilege GitHub App/workflow to request it. GitHub may require admin action to enable settings, depending on account permissions.
- Deployment occurs only after merge, with separate smoke/health verification; distinguish 'merged' from 'published/live'.
- Track and expose states queued, building, tests, review, merge, deploy, live/verified, blocked. Include link and blocker when stopped.

## Proof before marking complete
- Test uninterrupted execution of a routine task through to verified deployment without an owner merge click.
- Test failed checks remain blocked, high-risk changes request owner approval, and a dropped voice/chat session does not lose the job.
- Link implementation PRs and evidence to issue #142.
