# Brain remodel — local installation candidate, 10 October 2026

This candidate extends the existing `BrainHub` shelf implementation in checkout revision `2fac9ecb1ed2b1ebac277eb5944e962a42fda586`. It is an uncommitted local change, not installed or published. No production systems were called.

The named saved sources `brain-shelves-plan-20261009` and `brain-map-20261008` parts 1–4 are absent from local source/docs. The checkout has shallow history and no PR #70 branch/patch. Its existing shelf implementation was retained as the available starting point; its relationship to PR #70 cannot be proved locally. Exact comparison against those sources remains missing. No replacement saved plan, seeded record, database write or copied archive was created.

## Implemented behavior

- Existing shelves keep their categories, counts from readable owner-scoped sources, original-source Open, manual category controls, room/folder filters, search and Back. Filtered result counts and the 200-row display limit are explicit. Unavailable sources are labelled partial.
- Every shelf has a direct `/brain#shelf-<category>` link; browser history and direct entry select the corresponding view. Valid categories: downloads, knowledge, discussions, memory, projects, rules-skills, unsorted. Needs a category remains visible on the hub when such items exist.
- Existing computer upload/link controls are available from the hub and each shelf. Saving refreshes the index. Uploads initially belong to Downloads, retaining originals; eligible records can be filed with existing category labels. This does not invent a new upload category or write permission. Knowledge links to existing document-text import; Memory, Projects and Rules & Skills expose their applicable existing controls.
- Navy/gold header and serif shelf titles follow Legal room presentation. Existing Brain category colors, warm shelf/lamp palette, map, document import and memory sections remain.
- Two provider navigation cards, ChatGPT / Codex and Claude, lead to anchored existing Build & Testing panels. Opening a card does not start a provider call or a build. Provider routing, connection controls and permissions are unchanged. There was no combined provider card in the locally available Brain page to literally split.
- Elsie's authenticated Brain metadata context uses the same category descriptions and routes, explains shelf controls/upload destination and supplies both provider routes. Existing typed-request context and voice's submit-office-request path share that context; no extra provider call was added. Reading metadata does not imply file-content reading or live verification.

## Exact local checks

All checks run on 10 October 2026 UTC:

- `npm run typecheck`: exit 0.
- `GITHUB_ACTIONS=false npx vitest run src/components/office/BrainHub.interaction.test.tsx src/components/office/BrainHub.populated.test.tsx src/lib/brain-index.test.ts src/components/office/OfficeFiles.brain-tooltip.test.tsx src/components/office/LegalRoom.test.tsx src/lib/manager.functions.test.ts --reporter=default`: 6 files, 90 tests passed; final run started 03:20:17 UTC, duration 1.80 seconds, exit 0. Includes shelf click/keyboard/focus/Back, direct entry, room/search filtering, history events, provider links, shared Elsie descriptions, populated fixtures, existing upload tooltip and manager-context regressions. No paid/network test was run.
- `npm run build`: exit 0; client, SSR and Nitro build completed (2.09 seconds, 1.41 seconds, 776 milliseconds respectively). Existing server-function inputValidator deprecation and large-bundle warnings remain. This is a production-mode compilation, not a production call or deployment.
- Built Brain chunk: `brain-BllHFfSB.js`, SHA-256 `1e7bf2eda78ee8105017da9933ea53595b2fcbc013c62a2112c4b7f27fa2cff8`.
- Source SHA-256: BrainHub.tsx `ba2d2d2342ef8ecf42b3da3d7dae1527bc2cb136a0a5acfc47e4dbb97502504f`; brain-index.ts `6bb9851dde359b929608f081edea02121e997fe10c344c671efadb86ea70818f`.
- `git diff --check`: passed. Build evidence is local; no deployed build fingerprint or release health was marked verified.

## Installation acceptance still required

Compare the candidate against the actual saved plan, map parts 1–4 and PR #70 patch before declaring the complete saved remodel implemented. On an owner-authorized preview/device, open populated shelves signed in, compare counts and partial-source disclosures, search/filter, use app and browser Back, reload direct shelf links, and test responsive layout and keyboard focus. Test upload/download/open, document import and manual filing against real records using existing owner/MFA controls; confirm originals and versions remain intact. Ask Elsie to describe the shelves through typed and voice requests. Test both provider-card destinations without dispatching a paid build. Fixture renders cannot verify these live paths. John opening an earlier remodel does not verify this candidate's build.

No protected changes were needed for the implemented scope. Exact plan fidelity and signed-in/device acceptance remain outstanding. No push, merge, publication or installation was attempted.
