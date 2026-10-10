# Draft: Brain shelf synopsis bubbles

Brain hover/focus bubbles previously rendered full indexed record lists and filing controls. They now show only a brief shelf synopsis with its current indexed count and an Open button. Clicking the shelf opens its full contents without truncation. Empty shelves report 0 items; unreadable shelf labels retain the unknown-count warning.

LegalRoom was inspected: its topic cards present descriptions and counts before selection reveals papers. This checkout has no separate Legal synopsis hover implementation. Brain follows that synopsis-first interaction while retaining its existing Radix portal, viewport collision handling, Escape dismissal, keyboard focus and touch information-button toggle.

Shelves move forward visually by two pixels with a gentle transition. The compact bubble fades/zooms over 200 ms after a 75 ms opening animation delay. A 200 ms close delay bridges the pointer gap; focus within the shelf or bubble prevents pointer-leave dismissal. Reduced-motion and existing Office movement settings remain supported.

## Checks

Targeted Brain interaction, populated Brain, LegalRoom and shelf-registry tests pass (41 tests), including 25/82-item counts and complete shelf lists, pointer crossing, keyboard/Escape, focus retention, touch toggling and empty/unreadable states. TypeScript checking passes. Fixture checks do not verify signed-in saved-data behavior.

## Device verification still needed

Check the animation and pointer crossing in a desktop browser, collision positioning near viewport edges, keyboard and screen-reader announcement, reduced-motion behavior, and tap toggling/direct shelf opening on iOS and Android. No production systems were called.

## Draft status

Changes remain local and uncommitted for review. No push, merge, publication or external contact was performed. No protected configuration or saved-data behavior was changed.
