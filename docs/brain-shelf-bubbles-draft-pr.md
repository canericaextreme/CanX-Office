# Draft PR: Summarise Brain shelves in ordinary language

Base: local checkout at `ba2e68c`. Local review draft only; no commit, push, merge, publication, production calls or external contact.

Brain shelf bubbles now use a short paragraph beginning “On this shelf you will find”. Counts, newest dates and sample title lists have been removed from the overview. The paragraph describes the kinds of records actually present and why they are gathered on that shelf. Known saved origins refine notes and memories into goals, preferences, rules, project notes, conversations or build/connection history. Titles and document bodies are not guessed or interpreted. A file filed in Workshop remains described as a saved file, not an invented project.

For example, a Library with files and imported documents reads: “On this shelf you will find saved files and imported documents, gathered here to keep reference material easy to find and return to. This overview uses saved record details rather than the full contents.”

Empty shelves describe no saved material yet. Partial reads disclose possible missing contents; unreadable filing reports unavailable contents instead of claiming to know what is there. The screen-reader description uses the same paragraph. Shelf-face counts and recent activity retain their existing roles outside the bubble.

The accepted shelf motion, fixed overlay position and entry anchor, gentle entrance, leaving/focus dismissal, click-to-open, keyboard/Escape and touch controls are unchanged. Add files/photos and the upload dialog keep the existing light, readable styling. No protected changes are needed. Changed TypeScript/test files are formatted to satisfy their lint checks.

## Checks

Passed locally on 11 October 2026:

- Full `bun run test`: 145 files, 1,482 tests, exit 0.
- `bun run typecheck`: exit 0.
- `bun run build`: exit 0.
- ESLint on all four changed source/test files: exit 0.
- `git diff --check`: passed.

Regression coverage checks shelf-specific record kinds, explicit saved origins, all eight paragraph openings, empty/partial/unreadable states, large shelves without titles/counts, populated rendering, and the existing pointer, keyboard, touch and click interactions. Existing build/deprecation warnings remain. Fixture checks are not signed-in Office health verification.

## Device review still required

No browser screenshots or real-device checks were performed. Review paragraph wrapping and scrolling at narrow widths, desktop hover entry/exit, keyboard focus and Escape, reduced motion, screen-reader descriptions, iOS/Android tap toggling and Add files/photos contrast. Separately check populated signed-in Brain on the candidate build with the owner; production was not accessed during this work.
