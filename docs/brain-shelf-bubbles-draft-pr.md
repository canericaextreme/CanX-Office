# Draft: Brain shelf forward motion and narrative bubbles

Brain shelves now enlarge to 110% with the shared Office map's 300ms transition, inspected alongside LegalRoom and RoomHotspot. Legal and the shared map remain unchanged. A stationary outer boundary, raised active stacking, wider grid spacing and a 200ms pointer-gap grace period keep the interaction stable.

The small portalled bubble reveals over 200ms after a 100ms delay, so forward motion starts first. Explicit opacity states and animation fill in both directions hide the opening delay and preserve a smooth exit. Reduced motion disables shelf transforms and bubble animation while keeping the bubble visible.

All eight summaries begin “On this shelf you will find...” and distinguish intended use from confirmed indexed titles (at most three bounded examples), with counts secondary. Rulebook covers working instructions, agreed rules, saved team guidance and canonical Office Skills. Unreadable filing reveals no titles; empty and partial readable-index states disclose their limits. Summaries do not inspect originals or infer filing from titles.

Clicking the shelf or bubble's Open button retains the complete indexed list and existing filing controls. Keyboard focus, Escape, focus transfer into the portal and touch information-button toggling remain supported.

## Validation

45 targeted tests pass: shelf summary/registry, Brain interaction, populated Brain and saved-file tooltip fixtures. Coverage includes all eight purposes, unavailable metadata, partial sources, motion classes and ordering, initial reveal fill, stationary boundary, pointer crossing, keyboard/Escape, touch toggling and complete 25/82-record lists with filing controls. Typecheck and production build pass. These are fixture and compile checks, not signed-in verification.

## Device testing required

Check desktop animation timing and absence of a flash, smooth exit, rapid pointer movement, enlarged-card spacing, long-card/viewport-edge collision placement, keyboard and screen-reader use, reduced motion, and iOS/Android tap toggling and direct opening.

## Draft status

Local, uncommitted changes only. No production calls, push, merge, publication or external contact. No protected configuration, credentials, access controls, dependencies or saved-data behavior changed.
