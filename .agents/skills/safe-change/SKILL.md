---
name: safe-change
description: "Use when modifying, fixing, removing, replacing or improving an existing feature. Scope: Identify dependencies, preserve unrelated working features and data, make the smallest practical complete change, fix root causes, test the change and related functions, and report what changed. Boundary: Do not perform destructive database operations, weaken security, make major architectural changes, or remove working functionality without stopping and explaining the risk first."
---

# Safe Change

## Trigger and command

Use when modifying, fixing, removing, replacing or improving an existing feature. Scope: Identify dependencies, preserve unrelated working features and data, make the smallest practical complete change, fix root causes, test the change and related functions, and report what changed. Boundary: Do not perform destructive database operations, weaken security, make major architectural changes, or remove working functionality without stopping and explaining the risk first.

Invoke explicitly with `/safe-change`.

## Authority

Follow current Workspace Knowledge at all times, and resolve conflicts using the stated project/workspace authority rules. Read relevant project knowledge before acting. This Skill adds no authorization: review/inspect/check/diagnose is read-only; prepare/draft is proposal-only; implement only the owner-authorized scope. Preserve security, privacy, data integrity, evidence/history, reporter loop-back, jurisdiction separation, ownership/portability and human authority over safety-critical AI.

## Workflow

1. Inspect the affected implementation, dependencies, data flows and current errors before editing. Identify the requested result and preserve unrelated functionality.
2. Make the smallest practical complete change within the authorized scope. Correct the root cause, not only the visible symptom; keep a reversible path.
3. Test the changed behavior and affected existing functions using meaningful inputs. Verify rendered changes visually when applicable.
4. Report changed files or features, what stayed unchanged, tests actually performed, limitations and whether production was verified.

## Boundary

Do not perform destructive database operations, weaken security, make major architectural changes, or remove working functionality without stopping and explaining the risk first.
