# Read-only CanX database verification report

## Scope
Produce a concise evidence report from the existing CanX-owned external database configuration only. Make no code, file, database, authentication, connector, secret, or deployment changes.

## Verified evidence to report
- Identify the configured database host without exposing keys or credentials.
- Record the successful authentication-service health response.
- Record the anonymous read probes for the CanX Office tables and explain what their permission-denied responses establish.
- Record the database API responses for every table proposed by DESIGN-ONLY migration 0007.

## Evidence boundaries
- Label each finding as **VERIFIED**, **NOT VERIFIED**, **NOT PRESENT**, or **BLOCKED**.
- Treat a permission-denied response as evidence that anonymous access is denied, not as evidence of row counts, RLS details, grants, or migration completeness.
- Treat the database API's missing-table responses for all proposed 0007 tables as **NOT PRESENT** in the exposed `public` schema.
- Do not infer that migrations 0001–0006 are fully applied from application source or local SQL files. Report individual objects only where the live endpoint provides evidence.
- Mark schemas/catalog, exact policies and grants, authenticated row counts, storage buckets, and backup/restore status **BLOCKED** because this session has no direct database credentials or authenticated CanX owner session.

## Safest next step
Recommend a future read-only catalog inspection using an already-authorized database connection or a valid owner session with the required assurance level. Do not provision Lovable Cloud, connect anything, apply SQL, or suggest applying migration 0007.
