# Unreadable independent review — repair candidate

PR190 heads5dfff0c/04d2af9 received no parseable independent verdict. The
existing robot correctly left them unapproved, but did not retain a stop reason,
so the evidence cannot distinguish malformed output from truncation or refusal.
This candidate is not proof that the hosted failure has been resolved.

## Change

- Ask Anthropic for a JSON-schema-constrained verdict using its documented
  `output_config.format` contract. Keep the configured model and800-token cap.
- Accept only a completed, non-refused response with an exact two-field verdict
  and a nonempty bounded summary. Unknown, partial, malformed and refused
  responses remain unapproved, even if they contain valid-looking approval JSON.
- Report fixed stop codes, text character count and content-block count. Never
  log provider text, reasoning, prompts, source code or credentials.
- Review an immutable base/head comparison; never silently truncate a long diff.
- Add an optional manual dispatch input for one fresh review of an exact head
  whose latest bot-authored review documents an unreadable result. A substantive
  rejection cannot use this path. All normal gates must already admit a review;
  the fresh result is still required before merge. Existing evidence is retained.

The existing opt-in label, protected-file classification, independent company,
exact-head approval, checks, requested-changes block, daily review cap, model,
token cap, branch protections and merge decision policy remain in force.

## Protected release

Do not add `canx:auto-merge` to this PR. Root AGENTS.md says: “Do not label PRs
that change money, legal, sign-in, permissions, secrets, workflows, database,
or delete things”. This changes the protected merge workflow and requires
John's review/approval before merge, plus all required branch checks/reviews.
The candidate workflow is not run from the PR branch.

After the repair is approved and merged, use **CanX merge robot → Run workflow**
on main with `pr=190` and
`retry_unreadable_review_sha=04d2af93c0f953b9e9b6d7c57123441913e56d09`.
First confirm this is still190's current head. If it moved, inspect it again.
The dispatch requests a new bounded paid review within the existing cap; it
does not grant approval. A rerun is another explicit review request and should
not be used speculatively. An unreadable result stays blocked with diagnostics.

Then continue190's actual independent findings, guarded merge, publication,
and authenticated voice timing/listening acceptance. No1–2 second response or
naturalness improvement is established by unit tests or a merge.

## Evidence

`node --test scripts/automerge/*.nodetest.mjs`:22/22 passing, including request
schema/budget, truncation/refusal, strict parsing, exact-head/manual retry,
bot provenance, latest substantive rejection, normal policy gates and safe logs.
No real provider call, production workflow activation, status reset or release
was performed by these tests.

Provider contract: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
