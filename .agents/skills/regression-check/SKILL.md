---
name: regression-check
description: "Use when a significant code, database, authentication, navigation or application change could affect previously working features. Scope: Check important existing workflows for authentication failures, broken navigation, missing data, failed writes/uploads, permission problems, mobile issues and server/runtime errors. Boundary: Do not redesign or change unrelated features while regression testing. Report newly discovered problems separately."
---

# Regression Check

## Trigger and command

Use when a significant code, database, authentication, navigation or application change could affect previously working features. Scope: Check important existing workflows for authentication failures, broken navigation, missing data, failed writes/uploads, permission problems, mobile issues and server/runtime errors. Boundary: Do not redesign or change unrelated features while regression testing. Report newly discovered problems separately.

Invoke explicitly with `/regression-check`.

## Authority

Follow current Workspace Knowledge at all times, and resolve conflicts using the stated project/workspace authority rules. Read relevant project knowledge before acting. This Skill adds no authorization: review/inspect/check/diagnose is read-only; prepare/draft is proposal-only; implement only the owner-authorized scope. Preserve security, privacy, data integrity, evidence/history, reporter loop-back, jurisdiction separation, ownership/portability and human authority over safety-critical AI.

## Workflow

1. Identify changed areas, dependencies and important previously working workflows. Build a focused regression checklist without silently dropping relevant areas.
2. Run appropriate existing tests and exercise affected workflows, including login/logout, navigation, saved-data reads, writes/uploads, permissions and mobile behavior as applicable.
3. Inspect available server/runtime errors. Use signed-in populated states when required; fixtures or anonymous success do not establish saved-data production health.
4. Report pass/fail, tested environment, untested areas and newly discovered problems separately. Do not fix unrelated issues without authorization.

## Boundary

Do not redesign or change unrelated features while regression testing. Report newly discovered problems separately.
