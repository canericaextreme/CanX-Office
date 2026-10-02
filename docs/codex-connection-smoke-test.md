# Post-merge Data–Codex connection test

Run the local regression checks from the checkout:

```sh
npm test -- src/lib/codex-builds.test.ts src/lib/codex-status-command.test.ts src/lib/codex-task-handoff.test.ts
npm run typecheck
```

The connection tests mock GitHub. They check that a status request reads the
installed workflow without dispatching a build, handles an empty run history or
an active run, and reports HTTP, malformed-response, and network failures.
They do not verify deployed credentials, workflow installation, or deployment.

After merge and deployment, the owner can use **Check connection and builds**
in Build & Testing on desktop and mobile. Confirm that it shows run status or
an actionable error, that no new workflow run starts, and that the result is
readable on both devices. A successful status check proves workflow read access;
it does not prove build dispatch permissions or that a coding job can finish.

No live check, deployment, or build dispatch was performed for this change.
Missing credentials, workflow configuration, and enablement require separate
authorized setup; this test does not change them.
