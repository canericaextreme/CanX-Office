# Brain board preview — local draft

Open `/brain?preview=board` in the local Office, or follow **Open brain board draft preview** from Brain. This change is unpublished.

Draft #168 is not available in this checkout's files, branches or local history, and three.js is not an installed dependency. The page explicitly presents an SVG fallback. Reproducing #168's three.js board remains incomplete: supply its source and approve a way to include the required library before claiming that work is done. No remote draft or production system was contacted.

The existing `getRoomSnapshot` reader supplies real room data after **Read selected room**. Existing session and two-step requirements remain intact. No automatic polling, writes, AI calls, new services or spending controls are introduced. Only counts and source status appear; private record titles are omitted. Each read has a checked time and build label. A successful source read is not a verified release or evidence of running work. Partial and denied sources remain visible; a failed refresh clears that room's older result. Activity without a running-work feed remains explicitly labeled **demo data**. Diagram connections illustrate the layout, not authorized connections or measured traffic.

Validation: 39 targeted tests cover preview behavior and the existing room/device snapshot contracts. TypeScript and targeted ESLint are also checked. Fixtures are not signed-in verification.

Device testing still required: open the preview in the local signed-in Office on desktop and phone; select rooms by keyboard/touch; request reads including empty, populated and two-step-required rooms; compare the source counts with the corresponding room views; check failure and signed-out behavior. No production verification or publication was performed.

The implementation does not add a paid integration or make paid provider calls. Execution billing is not available to the page or this checkout, so the owner's $2 build cap cannot be independently measured here.
