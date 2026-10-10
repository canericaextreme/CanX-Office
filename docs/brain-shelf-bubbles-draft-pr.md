# Draft PR: Show Brain shelf contents in anchored bubbles

## Change
Hovering or keyboard-focusing a Brain shelf opens an anchored, non-modal bubble containing that shelf's indexed records and existing open/filing controls. The former visible synopsis box underneath the shelf is replaced; its screen-reader description remains. The existing information button toggles the bubble for touch users.

The existing Radix popover provides portal rendering, viewport collision handling and Escape dismissal. A short delayed close bridges the pointer gap between shelf and bubble. Width and height are bounded, and long contents scroll. The shelf grid, index reads, saving logic, access checks, source warnings and full shelf view are preserved.

## Validation
Targeted fixture tests cover shelf navigation, populated rendering, actual contents and controls, pointer transitions, Escape, keyboard focus, touch toggling, empty/unreadable states and opening the full shelf from the bubble. TypeScript checking and focused component linting are run locally. Fixtures do not verify signed-in production behavior.

## Device checks still needed
Desktop pointer crossing, collision positioning at viewport edges and during resize, long-content scrolling, keyboard traversal through bubble controls, screen-reader announcement, and tap toggling on iOS/Android need real browser/device verification. No screenshots or live production checks were performed; screenshot delivery and Brain-saving repair remain separate work.

## Branch and PR status
Intended branch: `codex/brain-shelf-bubbles` from source commit `414891a`.
Branch creation was attempted but blocked because this environment cannot write `.git/refs`. Changes remain uncommitted in the supplied checkout. This file is a local draft PR description, not a GitHub PR. No push, remote PR creation, merge or publication was performed under the owner's no-external-systems instruction.
