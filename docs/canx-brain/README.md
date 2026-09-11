# CanX Brain — knowledge baseline

Repository documentation only. Nothing in this folder is imported by application
code, bundled to the client, exposed through a route, or applied to any database.

## Baseline: 2026-09-11

Package `CANX-BRAIN-BASELINE-2026-09-11`, extracted unchanged into
[`baseline-2026-09-11/`](./baseline-2026-09-11/).

| What | File |
| --- | --- |
| Package README | [`baseline-2026-09-11/00_README.md`](./baseline-2026-09-11/00_README.md) |
| Knowledge transfer report | [`baseline-2026-09-11/01_KNOWLEDGE_TRANSFER_REPORT.md`](./baseline-2026-09-11/01_KNOWLEDGE_TRANSFER_REPORT.md) |
| Model handoff | [`baseline-2026-09-11/MODEL_HANDOFF.md`](./baseline-2026-09-11/MODEL_HANDOFF.md) |
| Manifest and hashes | [`baseline-2026-09-11/MANIFEST.json`](./baseline-2026-09-11/MANIFEST.json) |
| Brain records (16) | [`baseline-2026-09-11/records/canx-brain.json`](./baseline-2026-09-11/records/canx-brain.json) |
| Project records (11) | [`baseline-2026-09-11/records/projects.json`](./baseline-2026-09-11/records/projects.json) |
| Decision records (18) | [`baseline-2026-09-11/records/decisions.jsonl`](./baseline-2026-09-11/records/decisions.jsonl) |
| Rules | [`baseline-2026-09-11/records/rules.md`](./baseline-2026-09-11/records/rules.md) |
| Record schema | [`baseline-2026-09-11/schema/canx-knowledge-record.schema.json`](./baseline-2026-09-11/schema/canx-knowledge-record.schema.json) |
| Source register | [`baseline-2026-09-11/sources/SOURCE_REGISTER.md`](./baseline-2026-09-11/sources/SOURCE_REGISTER.md) |
| Protected-area design | [`baseline-2026-09-11/protected/PROTECTED_AREAS_DESIGN.md`](./baseline-2026-09-11/protected/PROTECTED_AREAS_DESIGN.md) |
| SQL — DESIGN ONLY / NOT APPLIED | [`baseline-2026-09-11/database/0007_canx_brain_knowledge_DESIGN_ONLY.sql`](./baseline-2026-09-11/database/0007_canx_brain_knowledge_DESIGN_ONLY.sql) |

## Status

- `0007_canx_brain_knowledge_DESIGN_ONLY.sql` is **DESIGN ONLY / NOT APPLIED**.
  It is not part of `docs/migrations/` and must not be applied without John's
  explicit approval.
- No secret values are stored here.
- Validated on import: 11 manifest files, all SHA-256 hashes matching, JSON and
  JSONL parsing cleanly, 11 projects, 16 Brain records, 18 decision records.
