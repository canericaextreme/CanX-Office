# Office functions ship by merging to main (standard since 15 Oct 2026)

**Rule for every AI (Claude, ChatGPT/Codex, Elsie) and for John:** `office-mcp`, `office-view` and `office-consent` reach Supabase by merging a PR into `main`. Nobody pastes function code into the Supabase dashboard any more. John approved this on 15 Oct 2026.

## How it works
`.github/workflows/office-functions-deploy.yml` runs on every push to `main` that touches the functions, `src/lib`, or the bundle script.
1. It builds the single-file bundles with `scripts/office-view/bundle-functions.mjs`, using esbuild `0.28.2`. That version reproduces the hand-deployed files byte for byte (office-mcp `dbac8bc3…` from `ad069a1`, and `bc6b92ed…` from `50f7147`).
2. It also builds the bundles from the commit of the last successful deploy run (the first time, `ad069a1`, which was the live hand-deployed state) and deploys only the functions whose bundle bytes changed. A website-only change to `src/lib` deploys nothing.
3. Before each deploy it reads the function's current **Verify JWT** setting from the Supabase Management API and deploys with the same setting. Afterwards it checks that the setting is unchanged and the version number went up. It refuses to create a function that does not exist yet.
4. It never reads or changes function secrets.
5. The run's summary and `::notice::` lines record the version change and the bundle SHA-256.

## Setup (once)
Repository secret `SUPABASE_ACCESS_TOKEN`: a Supabase personal access token (supabase.com/dashboard/account/tokens), added under GitHub repo Settings → Secrets and variables → Actions. Never paste it into a chat. Without it the deploy step fails with a clear message and deploys nothing.

## Everyday use
- **Ship a change:** merge the PR. Then check Actions → "CanX Office functions deploy" is green and its summary lists the new version.
- **Redeploy by hand:** Actions → "CanX Office functions deploy" → Run workflow. Leave the box empty to deploy what changed, or type function names (for example `office-mcp`) to force them.
- **Undo:** revert the PR on `main`. The workflow sees the bundle change back and redeploys the old code.
- **Not covered:** `claude-chat`, database migrations, secrets, and the "Verify JWT" setting itself. Those still need John.

## Verify a deploy really happened
Check the run summary's version (`v0 → v1`) and bundle SHA-256 against a local rebuild (`node scripts/office-view/bundle-functions.mjs out` with esbuild 0.28.2). Then do a live test: `view_room` for a granted room, then collect with the returned `requestId`.
