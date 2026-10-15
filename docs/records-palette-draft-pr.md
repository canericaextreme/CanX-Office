# Draft PR: Apply the White Claw-inspired palette to Records

Records now uses hot pink headings, controls and focus rings; deep burgundy accents; metallic silver borders, muted text and a subtle stationary sheen; charcoal grey background; white text; and navy cards. All overrides are scoped beneath a wrapper rendered only by the Records route. Other rooms and shared components retain their styles.

This is a local review candidate. No GitHub PR was opened because this task explicitly prohibits pushing and contacting production systems. Nothing was merged or published.

## Scope and review limits

- No changes to layout rules, breakpoints, event handlers, exports, data, permissions or dependencies. Existing desktop and mobile repair implementations remain unchanged.
- The referenced White Claw photo was not available in this checkout or attached to this task. Hex values approximate the six named colours; exact photo matching needs owner visual review.
- Portalled dialogs retain the existing shared Office theme; this draft does not change shared overlays or the Office manager.
- Device acceptance remains pending: on signed-in desktop, open Records with saved files, expand/collapse knowledge sections and check existing file controls. On a phone, check portrait/landscape, scrolling, keyboard input and all three previously repaired mobile behaviours, including the manager overlay. Confirm other rooms keep their colours.
- After a separately authorised publication, capture the signed-in Records room on the published build and show the owner the new picture. No live capture or signed-in health verification was attempted here.

## Validation

- `npm test -- --reporter=dot`: 160 files, 1,634 tests passed, including existing mobile overlay, scroll-lock, draggable-panel, Astra panel layout and populated saved-file tests.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing deprecation and bundle-size warnings remain.
- `git diff --check`: passed.

Automated checks do not establish signed-in device behaviour, photo fidelity or published Office health.
