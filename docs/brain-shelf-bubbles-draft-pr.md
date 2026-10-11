# Draft PR: Keep Brain synopses inside their shelves and lighten uploads

Base: `main` at `e2018fe`. Reconstructed locally because build38096499070 was not packaged.

Hovering or focusing a Brain shelf now reveals a compact synopsis inside that shelf box. Its entrance animation uses pointer-entry coordinates as a fixed transform origin, with no pointer-move repositioning. The bubble cannot flip above or below the shelf. Pointer exit dismisses it unless keyboard focus remains inside. Clicking the synopsis or shelf opens full contents. Keyboard focus, Escape (including focus return from the synopsis), touch information-button toggling, reduced motion and scrolling within narrow shelf boxes remain supported. Existing 3D shelf face motion is preserved.

Synopses show indexed type counts, the newest known saved date and up to three actual saved titles (each bounded to 90 characters). They disclose metadata/read limits and partial unavailable sources; unreadable shelf filing shows no titles or guessed count. Recent activity remains its existing short dated list. Updated populated-render tests allow old and undated titles in shelf description spans while proving they do not become full record rows in the collapsed hub. Interaction coverage checks 25/82-item full contents, fixed entry coordinates, shelf-local placement, dismissal, touch, keyboard, focus return and synopsis clicks.

Brain's Add files or photos trigger and portalled upload controls use a light opt-in theme. Other room themes and all data, upload, authentication and filing behavior remain unchanged. There are no upload tabs in this base; scoped tab styling is included for that role. The Choose from computer button is styled, but the operating system's native chooser window cannot be themed by application CSS.

## Verification

Final checks passed on 11 October 2026:

- Entire `bun run test` suite: 145 files, 1,481 tests passed (exit 0).
- `bun run typecheck`: passed (exit 0).
- `bun run build`: production build passed (exit 0).
- `git diff --check`: passed.

The test command used `GITHUB_STEP_SUMMARY=/tmp/brain-test-summary` to keep the CI reporter output inside the permitted filesystem. Existing server-function deprecation and build optimization warnings remain. Fixture tests do not verify signed-in saved-data behavior or Office health.

## Review and visual limits

PR87 and the previous candidate are absent from local refs. No external systems were called to retrieve them. The requested dismissal/animation ideas are implemented locally; PR87's external positioning is not used. No browser screenshots or device visual checks were performed. Before owner acceptance, check desktop entry near shelf edges, scrolling and click targets on narrow screens, keyboard/screen-reader behavior, reduced motion, and iOS/Android tap toggling. Confirm populated signed-in Brain separately on the current build; local fixtures cannot satisfy that verification.

This is a local draft PR package only. No GitHub PR was created, and nothing was committed, pushed, merged or published. Changes are restricted to src/ and docs/; no protected changes are needed.
