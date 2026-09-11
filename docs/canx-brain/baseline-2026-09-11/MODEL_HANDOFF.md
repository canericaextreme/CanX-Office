# CanX Brain — Model-Neutral Handoff

Use this procedure with ChatGPT, Claude, the CanX Office Manager, or a future model.

## Loading order

1. Read `00_README.md`.
2. Validate `records/canx-brain.json` against `schema/canx-knowledge-record.schema.json` where practical.
3. Read `records/rules.md` before proposing or taking any action.
4. Load only the project and decision records relevant to the current request.
5. Consult `sources/SOURCE_REGISTER.md` when a fact is disputed, dated, incomplete, or high impact.
6. Treat `protected/PROTECTED_AREAS_DESIGN.md` as architecture only. It contains no permission to populate or open a protected vault.

## Authority and truth rules

- John's current clear instruction is authoritative unless it conflicts with a protected security, privacy, ownership, evidence, or safety rule.
- The canonical files/database records outrank a model's memory.
- Newer evidence may supersede older evidence, but the old record is retained.
- Never convert unknown into no, zero, healthy, complete, or connected.
- Separate proposed, configured, tested, verified, and production-verified.
- State conflicts instead of choosing the convenient version.
- A summary is not permission to act.

## Required answer shape for the Office Manager

For a management request, return:

1. plain-language result;
2. sources and dates used;
3. what is known, unknown, or conflicting;
4. suggested solution;
5. exact approval needed, if any;
6. next safe action.

## Updating knowledge

Never silently edit a current record. Create a proposed new version with:

- reason for change;
- old and new values;
- source evidence;
- effective date;
- author/model;
- reviewer;
- owner approval status when required.

When approved, mark the prior version superseded and keep it available for audit and export.

## Secrets boundary

Do not place passwords, API keys, tokens, MFA codes, recovery codes, private encryption keys, or raw payment-card data in prompts, records, logs, exports, or model context. Store credentials in approved credential systems and store only a reference such as `credential configured: yes/no/unknown`.

