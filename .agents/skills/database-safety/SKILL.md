---
name: database-safety
description: "Use when changing Supabase, database schemas, tables, views, RLS policies, storage, functions or migrations. Scope: Identify dependencies and affected data, preserve production records, prefer reversible changes, protect secrets, verify security policies afterward and test affected application functions. Boundary: Stop before destructive, irreversible or high-risk operations and explain the risk before proceeding."
---

# Database Safety

## Trigger and command

Use when changing Supabase, database schemas, tables, views, RLS policies, storage, functions or migrations. Scope: Identify dependencies and affected data, preserve production records, prefer reversible changes, protect secrets, verify security policies afterward and test affected application functions. Boundary: Stop before destructive, irreversible or high-risk operations and explain the risk before proceeding.

Invoke explicitly with `/database-safety`.

## Authority

Follow current Workspace Knowledge at all times, and resolve conflicts using the stated project/workspace authority rules. Read relevant project knowledge before acting. This Skill adds no authorization: review/inspect/check/diagnose is read-only; prepare/draft is proposal-only; implement only the owner-authorized scope. Preserve security, privacy, data integrity, evidence/history, reporter loop-back, jurisdiction separation, ownership/portability and human authority over safety-critical AI.

## Workflow

1. Inspect schema, constraints, dependent views/functions, policies, storage and affected application reads/writes. Identify affected records and the authorized environment.
2. Use the current project-approved migration and deployment process. Prefer additive and reversible changes; preserve original evidence, status history, audit history and jurisdiction separation.
3. Before any destructive, irreversible or high-risk operation, stop and explain impact, rollback/recovery limits and the explicit approval needed. Do not silently drop, truncate, overwrite or expose data.
4. After authorized changes, verify constraints, grants/RLS and affected application functions under appropriate user roles. Separate prepared migration, applied migration and verified production outcomes.

## Boundary

Stop before destructive, irreversible or high-risk operations and explain the risk before proceeding.
