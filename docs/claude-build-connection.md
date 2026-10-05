# Claude's Office build connection

John authorised Claude to work independently on CanX Office coding and builds on 4 October 2026, and initially authorised a US$10 cap per build; the current Office-dispatched cap was lowered to US$2 for the connection test. The Office's Build & Testing page now contains a separate Claude build entry beside Codex.

The build uses the same repository, allowed source scope, candidate checks, isolated trusted draft publisher and release policy as the existing Codex setup. Claude Code is pinned to 2.1.289. It receives file tools only; the fixed runner runs tests afterward. No Office session, Finance credential, Supabase credential, or deployment token enters the coding job.

## One-time secure runner setup

The shared private GitHub connection already used by the Office dispatches the fixed Claude workflow. Its server enablement uses the existing build enablement, with `CANX_CLAUDE_ENABLED=false` available to disable Claude alone.

GitHub must have a repository Actions secret named `ANTHROPIC_API_KEY` containing a Claude Console API key, stored through GitHub's secure Secrets page. The Vault secret is not automatically replicated into GitHub Actions. Do not paste the key into chat, source, workflow inputs, committed environment files or screenshots. Set appropriate Anthropic Console account spending controls before enabling paid builds. Claude Pro and API charges are separate.

The owner-approved per-run maximum is sent as `max_budget_usd=2`; the workflow validates 0.10–10.00 and passes it to Claude's CLI. Reaching the CLI budget, turn or runtime limit ends the candidate attempt. Failed attempts are reported as failed, never merged, retried with a larger budget or published automatically. The runner cap is distinct from the Office AI conversation budget; account-wide billing controls remain necessary for aggregate usage.

The repository variable `CANX_CLAUDE_ENABLED=false` disables the workflow; the Office server setting of the same name disables submission. Routine source tasks must not disable either colleague or change authentication, permissions, budgets, workflows or credentials.

## Vault-backed coding advice

Supabase `claude-chat` reads the existing Vault key using its server-only built-in database connection. It keeps JWT verification enabled, revalidates the user with Auth, verifies owner role and AAL2, and reserves the existing Office AI budget before a paid message. It accepts a text prompt or bounded user/assistant messages and a deliberately selected model. A models check is non-billable. Provider errors are sanitized. This advice endpoint has no editing or build tools.

## Verification status

Unit tests cover owner rejection, scoped dispatch, per-build limits, duplicate/uncertain dispatch protection, Vault non-exposure, invalid prompts and conversation budget rejection. Deployment, a valid signed-in response, runner-secret presence and a real completed Claude build must be verified separately; installed code is not evidence that these succeeded.

## Elsie routing (5 October 2026)
Elsie can now send a green Office code request to Claude when John names Claude in his current request (typed or spoken via `submit_office_request`), check Claude builds read-only, and check a saved task's build using the builder recorded on the task. Codex remains the default. The Build & Testing Claude panel has a "Hand to Elsie" control that delegates John's request to Elsie and shows her results; it is an Elsie handoff, not Claude tool use. See the capability matrix in `docs/office-audit.md`. Live signed-in verification is still required.
