---
name: pre-publish-check
description: "Use when preparing to publish, deploy or release an important application change to production. Scope: Test relevant login/logout, permissions, navigation, forms, database writes, uploads, protected routes, mobile behavior, security controls and affected existing functions; verify the live production application actually received the intended deployment. Boundary: Do not declare success based only on a successful build or publish request. Finish with READY TO PUBLISH or DO NOT PUBLISH YET, with blockers identified."
---

# Pre-Publish Check

## Trigger and command

Use when preparing to publish, deploy or release an important application change to production. Scope: Test relevant login/logout, permissions, navigation, forms, database writes, uploads, protected routes, mobile behavior, security controls and affected existing functions; verify the live production application actually received the intended deployment. Boundary: Do not declare success based only on a successful build or publish request. Finish with READY TO PUBLISH or DO NOT PUBLISH YET, with blockers identified.

Invoke explicitly with `/pre-publish-check`.

## Authority

Follow current Workspace Knowledge at all times, and resolve conflicts using the stated project/workspace authority rules. Read relevant project knowledge before acting. This Skill adds no authorization: review/inspect/check/diagnose is read-only; prepare/draft is proposal-only; implement only the owner-authorized scope. Preserve security, privacy, data integrity, evidence/history, reporter loop-back, jurisdiction separation, ownership/portability and human authority over safety-critical AI.

## Workflow

1. Identify the intended project, production URL, change and current deployment. Confirm publication authorization separately; this Skill does not authorize deployment.
2. Test applicable workflows in the real user state, including signed-in and populated states where required. Preserve records and use only authorized test writes/uploads; missing access is a blocker, not a pass.
3. Check desktop and mobile behavior, protected routes and security controls. Record the exact checks, environment, version and results.
4. If deployment is authorized and performed, verify the actual published version and affected routes, including caching or project/branch mismatches. If deployment has not occurred, mark production receipt unverified and identify the post-deployment checks.
5. Finish with READY TO PUBLISH only when applicable pre-release checks passed; otherwise DO NOT PUBLISH YET. Name blockers and separately state whether production deployment and live acceptance were actually verified.

## Boundary

Do not declare success based only on a successful build or publish request. Finish with READY TO PUBLISH or DO NOT PUBLISH YET, with blockers identified.
