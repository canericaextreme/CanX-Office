# Phone rotation investigation — 26 October 2026

Status: reported lock not reproduced; root-cause fix remains unimplemented.

The local checkout is a shallow snapshot at `3266e86` with exactly one
available commit. Builds 42 and 43 cannot be compared from that history.
No remote history, production systems or owner records were accessed.

Inspected rotation controls:

- `public/` contains no web app manifest. `src/routes/__root.tsx` has no
  manifest link; its viewport is `width=device-width, initial-scale=1`.
  There is no manifest orientation field to revert in this snapshot.
- Searches of `src/` and `public/` found no screen orientation lock or legacy
  orientation-lock API calls.
- `src/styles.css` has portrait/landscape media queries for responsive controls,
  navigation and the map. No page rotation transform or portrait constraint
  was found. The portrait hint in `src/routes/_office.tsx` is informational.
- `src/hooks/use-mobile.tsx` includes landscape touch phones.
  `src/hooks/use-phone-viewport.ts` listens for window and visual viewport
  resize, updates both panel dimensions and cleans up its listeners.

No runtime or layout change was made: adding a manifest or an orientation API
call without evidence would not establish or reverse the reported regression.
Two regression tests in `src/hooks/use-phone-viewport.test.ts` exercise
portrait → landscape → portrait panel resizing, with and without
`visualViewport`. These simulate resize events; they cannot establish physical
device rotation or visual layout correctness.

To finish diagnosis, the source snapshots/diffs corresponding to builds 42
and 43 and the affected installed app's manifest need to be available locally.
No exact file/change causing a lock can truthfully be named from this snapshot.
Any deployment-injected manifest or platform setting remains uninspected, not
an established cause. Changes outside `src/`, `public/`, `docs/` and `tests/`
would require separate scope.

Device acceptance remains required on John's phone: rotate portrait → landscape
→ portrait in the browser and installed home-screen app, with the Office and
an open assistant panel, including keyboard open/closed. Check navigation,
content width, scrolling and reachable controls in both orientations. No
device, signed-in room, production or installed-app verification was performed.

Local checks: `npm test` passed 218 files / 2,153 tests; the focused phone
viewport run passed all eight tests including the two added rotation cases.
`npm run build`, `npm run typecheck` and `git diff --check` passed. Vitest
reported an unwritable GitHub step-summary path after passing (exit code 0);
the build also reported deprecation and bundle-size warnings. Nothing was
pushed, merged or published. Security, database, room content and saved data
were not changed.
