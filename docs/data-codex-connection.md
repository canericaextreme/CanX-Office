# Data–Codex build connection

Status: implemented for review; live credentials and end-to-end execution have not been verified.

## What is connected in code

- Owner/MFA-protected build submission and live run status from Data or Build & Testing.
- Only the owner's current text is sent as a build brief. Office records, voice history and owner session credentials are not sent to the coding job.
- GitHub-hosted Codex edits a separate checkout, then automated typecheck, tests and build run.
- A separate publisher job creates a draft pull request on `codex/office-RUN_ID`; it never executes the generated code with repository write credentials.
- Data can retrieve a draft's head SHA and bounded patch excerpts as evidence for the existing Claude second-eyes path. This is a partial review; large patches need a complete review before release.
- Draft changes are not merged or published automatically. ChatGPT can inspect the same repository and draft PR through the existing connector.
- Supported automatic proposal paths: src/, docs/, public/, tests/. New binary assets, dependency or workflow changes require a separate implementation/review path. Database, safety, access and spending changes are excluded from routine jobs.

## Activation needed

1. Merge this reviewed implementation so `canx-codex.yml` exists on main.
2. GitHub repository Actions secret `OPENAI_API_KEY`: a CanX-owned OpenAI project key authorized for Codex. Never paste it into a chat, prompt, source file, or workflow input. Set the approved project spending controls first. These build costs are separate from the existing Data chat reservation accounting; this implementation does not claim a hard CAD cap.
3. GitHub repository variable `CANX_CODEX_ENABLED=true` only after configuring that key and the permitted build spend. The workflow has a 25-minute coding job limit, not a dollar limit. GitHub-hosted runner usage can also consume the account's included or paid minutes.
4. GitHub Actions settings must permit creating pull requests. The build job has only contents:read; the separate publisher job has contents:write and pull-requests:write.
5. Lovable private server secret `CANX_CODEX_GITHUB_TOKEN`: a fine-grained token scoped only to canericaextreme/CanX-Office, with Actions read/write and Pull requests read. It cannot edit repository source through the office endpoint. GitHub tokens cannot be recovered from ChatGPT's connector.
6. Lovable private server setting `CANX_CODEX_ENABLED=true`. Do not use a VITE_ prefix for either setting. Publish the office after applying settings.
7. In Build & Testing, use Check connection and builds. Submit a small harmless UI change; verify the workflow, candidate tests and draft PR. Ask Data to check the PR evidence, then request Claude review. Verify the actual UI before publishing the proposed change.

A connector installed in ChatGPT does not automatically provide credentials to the deployed office or GitHub Actions. Current tools do not expose a secure secret-install operation for those two services. Activation cannot be honestly claimed without completing these steps.

## Operational limits

- Run status is checked on request; this release does not claim background monitoring or automatic completion notifications.
- One workflow runs at a time; GitHub concurrency may cancel an older pending run when a newer request arrives. Check actual statuses. An uncertain dispatch is never automatically retried.
- The preflight active-run check is a convenience, not a transactional duplicate lock or spend cap.
- Automatic tests do not establish real microphone behavior or clinical, legal, highway-safety suitability.
- Untrusted Codex explanations and patch excerpts are evidence, not new instructions or authorization.
- To stop new jobs, disable the office setting and GitHub variable. Already-running jobs must be cancelled in GitHub Actions.

Sources checked September 22, 2026:
- https://learn.chatgpt.com/docs/github-action
- https://docs.github.com/en/rest/actions/workflows
