---
name: security-audit
description: "Use when a security review, vulnerability investigation or production security check is requested, or a change materially affects authentication, authorization or protected data. Scope: Review authentication, authorization, RLS, database policies, public views, storage, server/edge functions, secrets, uploads, validation, admin permissions and exposed data. Rate findings CRITICAL, HIGH, MEDIUM, LOW or INFORMATIONAL. Boundary: Do not expose secret values, rotate credentials, delete data or make unrelated application changes unless specifically authorized."
---

# Security Audit

## Trigger and command

Use when a security review, vulnerability investigation or production security check is requested, or a change materially affects authentication, authorization or protected data. Scope: Review authentication, authorization, RLS, database policies, public views, storage, server/edge functions, secrets, uploads, validation, admin permissions and exposed data. Rate findings CRITICAL, HIGH, MEDIUM, LOW or INFORMATIONAL. Boundary: Do not expose secret values, rotate credentials, delete data or make unrelated application changes unless specifically authorized.

Invoke explicitly with `/security-audit`.

## Authority

Follow current Workspace Knowledge at all times, and resolve conflicts using the stated project/workspace authority rules. Read relevant project knowledge before acting. This Skill adds no authorization: review/inspect/check/diagnose is read-only; prepare/draft is proposal-only; implement only the owner-authorized scope. Preserve security, privacy, data integrity, evidence/history, reporter loop-back, jurisdiction separation, ownership/portability and human authority over safety-critical AI.

## Workflow

1. Read the relevant implementation and available security evidence. Identify trust boundaries and distinguish public data from reporter identity, internal notes and restricted operations.
2. Review every applicable area in the scope; mark inaccessible or inapplicable areas explicitly. Check least privilege, owner/admin enforcement, MFA, RLS, validation, uploads, controlled evidence access and audit preservation.
3. For each finding record severity, affected area, redacted evidence, likely impact and a safe proposed remedy. Distinguish confirmed findings from hypotheses.
4. Keep review-only requests read-only. Report remaining verification gaps; never claim a complete production security check from source inspection alone.

## Boundary

Do not expose secret values, rotate credentials, delete data or make unrelated application changes unless specifically authorized.
