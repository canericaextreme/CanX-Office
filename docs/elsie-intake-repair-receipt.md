# Elsie intake repair — local draft receipt

Date: 23 October 2026. Base commit: `0882e21b306ac1903c166b2e39cace53e199c9f5`.
Status: local, uncommitted draft for review. No push, merge, publication or production calls.

## Change

Broadened command intake in `src/lib/builder-choice.ts` for prepare, draft, put together, work on and broaden, plus internal handoffs to Elsie. Contextual intake distinguishes campaign preparation with cost estimates from imperative transaction/paid-plan changes. Preparation is routed away from direct code builds; existing action-specific owner checks remain in place. Manager intake guidance uses existing task assignment and preserves identified saved tasks. No new executor, permissions or retry path.

Expanded negative handling for pauses, waits and negated preparation/handoff instructions. Tests exercise ordinary changes, discussion, protected requests and mixed preparation/transaction clauses.

The We Belong task `6e689bf0-065a-4fd6-b66f-48cb82fd09dc` is an exact-reference acceptance fixture, not a live record read. Mocked intake assigns that task to Elsie, preserves its title/detail/project/evidence, creates no replacement task and starts no builder. A separate rejected-write fixture returns stopped, without claiming pickup or completion. Existing continuity/duplicate-attempt tests remain passing. Assignment persistence and task execution logic are unchanged.

## Actual local checks

- `npx vitest run --reporter=default src/lib/builder-choice.test.ts src/lib/builder-connections.test.ts src/lib/elsie-continuation.test.ts src/lib/manager-drive-actions.test.ts src/lib/manager.functions.test.ts src/lib/codex-task-handoff.test.ts`: exit 0; 6 files, 182 tests passed; final run started 17:42:50 UTC, duration 2.18s.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0; production Vite/Nitro build generated `.output`. Vite reported client build in 4.18s. Log contains deprecated server-function validator, tsconfig-path plugin, chunk-size and Node color warnings.
- `git diff --check`: passed.

Build log: `/tmp/elsie-intake-build.log` (local session file).
SHA-256: `bd736f24059b63f1c1708ce91c496e1d53ee9b17ed12ae725c156a3002483547`.

Built source SHA-256:

- `src/lib/builder-choice.ts`: `ad8cc402aefd8ee76b720ee2044f913e0cd104f9d0d6896582ce25a399b4b4f3`
- `src/lib/manager.functions.ts`: `6338429bebc9b86e8eb44803d50c9c7de9450529c2adc814fa07921c0e5e79f4`

This is a local build receipt, not a remote builder run, PR or deployment receipt.

## Separate unverified integration issues

1. Direct Elsie pickup: not verified. Existing assignment is not proof of execution. The existing saved-task builder executor supports only green CanX Office code changes; campaign preparation must use its appropriate existing workflow. This repair adds no campaign executor or automatic pickup mechanism.
2. Rejected record writes: production cause and resolution unverified. The local mock verifies truthful stopped reporting only; no production write, database/security repair or retry was attempted.

Owner/device acceptance still needs typed and spoken requests against the exact saved task, confirming transcription, pause/negation handling, saved assignment/readback and any actual pickup receipt. No browser, microphone or signed-in device checks were performed. The parser uses bounded deterministic patterns; model tool selection and arbitrary paraphrases are not proven by fixture tests. No authentication, authorization, database, spending or infrastructure changes.
