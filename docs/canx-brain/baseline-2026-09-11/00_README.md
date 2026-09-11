# CanX Office Knowledge Transfer Pack

Prepared for John Cantlon on 11 September 2026.

This pack is the first portable, CanX-owned knowledge baseline for the CanX Brain. It is designed to be readable by people, ChatGPT, Claude, and the CanX Office Manager without making any one model the owner of the information.

## What is in this pack

- `01_KNOWLEDGE_TRANSFER_REPORT.md` — findings, completed work, gaps, risks, and next steps.
- `MODEL_HANDOFF.md` — a model-neutral loading and update procedure.
- `records/canx-brain.json` — the normalized operational knowledge baseline.
- `records/decisions.jsonl` — one durable decision per line.
- `records/projects.json` — the Lovable project inventory and evidence-based status.
- `records/rules.md` — John's standing operating rules in plain English.
- `schema/canx-knowledge-record.schema.json` — the vendor-neutral record format.
- `database/0007_canx_brain_knowledge_DESIGN_ONLY.sql` — an additive database design. It has not been applied.
- `protected/PROTECTED_AREAS_DESIGN.md` — empty Business, Personal, and Legacy vault design.
- `sources/SOURCE_REGISTER.md` — sources used and known limitations.

## Important boundary

This pack contains operational CanX knowledge only. It intentionally contains no passwords, API keys, authentication codes, recovery codes, private journal entries, investment records, estate instructions, or other protected personal content.

The Business, Personal, and Legacy vaults are designed but empty. Their connectors are to remain off until John gives a separate, exact approval.

## Canonical ownership rule

The files and database records are the knowledge. Models are readers and assistants, not the source of truth. Every future change should create a new version, retain its sources, and preserve the earlier version.

