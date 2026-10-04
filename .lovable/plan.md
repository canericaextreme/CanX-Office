# Compact subscription service cards

## What will change
- Keep the Subscriptions hub short by replacing the expanded service rows with a bounded set of clickable service cards and an overflow chooser when needed.
- Show each service’s confirmed fixed rate prominently, with its currency and billing cycle; show “Cost unknown” when John has not confirmed one.
- Keep ChatGPT subscriptions separate from OpenAI API usage and never infer a plan, tier, currency, or cost.
- Open one focused service detail view at a time, with a clear Back to Subscriptions action. Details will show plan, confirmed cost source/date, renewal evidence, history, notes, and separate usage/top-up wording.
- Improve the existing editor with an optional plan-name field and clearer “confirmed fixed rate” labels.

## Data safety
- Add `planName` only as an optional field in the existing saved subscription record, including validation and round-trip preservation. Existing records remain valid and unchanged until John saves an edit.
- Do not change schemas, migrations, email records, Finance totals, or owner data during development.
- Annual records will display as annual billing, not as a made-up monthly equivalent.

## Review-routing follow-up
- Add a separate roadmap item: existing needs-review records must not be blanket-approved; future exception routing needs explicit source/confidence rules and its own state.
- This follow-up will not alter review states in this UI task.

## Verification
- Add record-cleaning tests for optional plan names and old records.
- Add populated interaction tests proving the hub stays compact, rates are truthful, service cards open details, and Back restores the hub.
- Run the relevant/full tests, TypeScript check, and preview build. Do not publish or call Gmail or paid services.
