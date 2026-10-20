---
name: release-summary
description: "Use when significant development work, a major fix, security change, database change or production release has been completed. Scope: Provide a short plain-language report covering Changed, Tested, Security, Database, Known Issues and Next Recommended Step. Boundary: Report only what was actually changed or verified. Do not claim testing, deployment or security verification that did not actually occur."
---

# Release Summary

## Trigger and command

Use when significant development work, a major fix, security change, database change or production release has been completed. Scope: Provide a short plain-language report covering Changed, Tested, Security, Database, Known Issues and Next Recommended Step. Boundary: Report only what was actually changed or verified. Do not claim testing, deployment or security verification that did not actually occur.

Invoke explicitly with `/release-summary`.

## Authority

Follow current Workspace Knowledge at all times, and resolve conflicts using the stated project/workspace authority rules. Read relevant project knowledge before acting. This Skill adds no authorization: review/inspect/check/diagnose is read-only; prepare/draft is proposal-only; implement only the owner-authorized scope. Preserve security, privacy, data integrity, evidence/history, reporter loop-back, jurisdiction separation, ownership/portability and human authority over safety-critical AI.

## Workflow

1. Collect evidence from the completed work and checks; distinguish code changed, feature verified and production verified.
2. Write six concise sections: Changed; Tested; Security; Database; Known Issues; Next Recommended Step. State unchanged or not checked where appropriate rather than inventing evidence.
3. Include tested environment/version and production verification status. Name exact blockers and any owner action still needed. Exclude secrets and private record contents.
4. Keep the report short and plain-language, and follow the owner's copy-box preferences when a copyable change report is required.

## Boundary

Report only what was actually changed or verified. Do not claim testing, deployment or security verification that did not actually occur.
