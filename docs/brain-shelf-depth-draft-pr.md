# Draft PR: Bring Brain shelves forward in 3D and lighten upload controls

Status: local draft prepared; no GitHub PR created, push, merge, production calls or publication. Base inspected: checkout main at d6c0f7e (PR83 merge). Remote main was not fetched under the owner's offline scope.

## Proposed description

Brain shelves previously rose only slightly. Each shelf now smoothly advances 48px in a 900px perspective on mouse hover or keyboard focus, with a deeper shadow and stable label. Its stationary anchor and existing delayed portal boundary keep the synopsis open across the pointer gap. The info control advances with the shelf and has a 44px touch target. Reduced motion removes transforms and transitions, while the bubble has no entry/exit animation.

Existing synopses summarize shelf purpose, indexed item types/counts and newest saved date. They now disclose readable-source limits and partial reads within the bubble. Shelf selection still opens contents directly; keyboard focus, Escape and separate touch synopsis toggling remain supported. No saved data, shelf names, filing or write paths changed.

The Add files or photos trigger and portalled upload dialog use a light palette only when opened from Brain. Other rooms retain their existing presentation and behavior. LegalRoom and its route were inspected first: this checkout has topic cards with descriptions/counts, but no Legal hover bubble implementation. No external comparison was claimed.

## Validation

- Relevant Brain interaction, populated rendering, shelf registry and OfficeFiles tests: 48 passed across 6 files, including hover-gap stability, keyboard focus/Escape, touch toggling, pointer selection with synopsis open, partial-source disclosure and Brain-only upload palette scope.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing server-function deprecation and chunk-size warnings remain.
- `git diff --check`: passed.

Fixture interaction tests do not measure rendered 3D motion or constitute signed-in live verification. No browser automation package is installed; no new dependencies were added. Visual/device acceptance remains pending: desktop mouse hover across shelf edges and bubbles, keyboard Tab/Enter/Space/Escape, touch info-toggle versus direct shelf tap, narrow-screen bubble placement, light upload controls in dark Office theme, reduced-motion preference, and real saved contents after owner sign-in.

Scope is limited to Brain presentation, shared OfficeFiles Brain-only styling, focused tests and these notes. No room-capture/snapshot implementation was changed; this is separate from PR81. Opening an actual draft PR requires a later authorized GitHub push/API action, prohibited in this run. Nothing is live from this candidate.
