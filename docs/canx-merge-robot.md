# CanX merge robot (issue #142)

Plain version: the merge robot is like a careful school crossing guard. A pull request only crosses
(merges into `main`) when the light is green on every check, a second teacher from a *different* school has
looked at it, and it is the kind of everyday change John already allowed. Anything about money, legal,
sign-in, permissions, secrets, deleting things or the robot itself waits for John.

## The road from task to live
1. **Assignment** – John authorizes a task. The AI doing it opens a pull request into `main`, marks it ready
   (not draft) and adds the label `canx:auto-merge`. That label is the record that this is authorized routine work.
2. **Build and test** – `CanX PR checks` (`.github/workflows/canx-pr-checks.yml`) runs typecheck, all Vitest tests,
   the production build and the robot's own rule tests on every pull request. Feature validations still run too.
3. **Independent review** – the robot asks the AI company that did **not** build it: Claude-built work
   (`claude/` branches) is reviewed by OpenAI, ChatGPT/Codex-built work (`chatgpt/`, `codex/`, `canx/`) by Anthropic.
   The verdict is saved as the commit status `canx/independent-review` on that exact commit, plus a PR comment.
   A new push needs a new review.
4. **Automatic merge** – `CanX merge robot` (`.github/workflows/canx-merge-robot.yml`) merges when every gate in
   `scripts/automerge/policy.mjs` passes. It wakes when the checks finish, when the label is added, when new
   commits arrive, and every 30 minutes as a backstop.
5. **Deploy** – if Office function code changed, the robot starts `CanX Office functions deploy`
   (a merge made by the robot does not trigger push workflows on its own, so it starts the deploy itself).
6. **Verify and record** – the app goes live only after the Lovable publish step; merged is not the same as live.
   The AI that owns the task publishes, checks the live result and writes the Brain note.

## What the robot shows on each pull request
One label and one comment it keeps up to date: `canx:state-waiting-checks`, `canx:state-waiting-review`,
`canx:state-owner-review` (with the reasons), `canx:state-blocked` (with what failed) or `canx:state-merged`.

## Never merged automatically (goes to John)
- Anything outside `src/`, `docs/`, `tests/`, `public/` (workflows, database, Supabase functions, scripts, packages).
- File names about sign-in, secrets, permissions/security/policy, money/budgets/subscriptions, legal, database
  structure, the Office gateway, paid builders or automation, connected mail/Drive, or AGENTS.md rules.
- Deleting or moving files, more than 20 files, or more than 600 changed lines.
- Unknown builder, a failed check, a merge conflict, or a reviewer who asked for changes.

## Switches and limits
- Off switch for the whole robot: repository variable `CANX_MERGE_ROBOT_ENABLED` = `false`.
- Reviewer off switch: `CANX_AI_REVIEW_ENABLED` = `false` (pull requests then wait for review).
- Spending: one review per commit, at most `CANX_AI_REVIEW_DAILY_CAP` (default 20) reviews per day, diff capped at
  60,000 characters. Models: `CANX_ANTHROPIC_REVIEW_MODEL` (default `claude-sonnet-5-5`), `CANX_OPENAI_REVIEW_MODEL`
  (default `gpt-5`). Uses the existing `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` secrets.
- Run by hand: Actions, CanX merge robot, Run workflow, optional PR number.
- Test without changing anything: `DRY_RUN=1 PR_NUMBER=<n> node scripts/automerge/run.mjs` with a GitHub token.

## Known limits
- The independent reviewer is an AI. It can be wrong, which is why the file rules, size limits and checks never
  depend on it.
- There is no branch protection on `main` because Lovable pushes there directly; the robot's own rules are the gate.
- Publishing the app (Lovable) and writing the Brain note are not done by GitHub; Elsie's merge wake (PR #132)
  would need its secure service before it can do that unattended.
