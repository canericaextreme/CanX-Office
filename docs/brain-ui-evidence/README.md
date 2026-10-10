# Brain shelf UI correction — local review

Implemented against local main at d6c0f7e. No fetch, production calls, publication, or PR81 changes.

Shelf faces now have a visible wooden side/base, perspective and layered shadows. Hover-capable pointers and keyboard focus advance the face 28px in depth and 6px upwards over 260ms. Reduced motion removes transforms and transitions while preserving shelf edges. The compact synopsis uses a stationary anchor and no entrance animation; existing indexed counts, unavailable-count handling, touch toggle, Escape, focus transfer and full-contents opening remain intact. Reviewed brain-shelves.ts; classification/count logic needed no changes.

Brain opts into OfficeFiles' bright upload panel with `brainAppearance`; other callers retain their existing theme. Upload, filing and permissions code is unchanged.

## Visual evidence limitation

No screenshots were captured: the local preview server and ChromeDriver both failed with `EPERM` / `Operation not permitted` when creating local sockets in this sandbox. Visual appearance is therefore unverified.

An offline real-component fixture is provided in tests/brain-visual. It has 25 synthetic Library records, mocks server functions and owner session, and starts in the dark Office theme to expose upload contrast regressions. Its Vite build passes. On a machine permitting local sockets:

```
node node_modules/vite/bin/vite.js --config tests/brain-visual/vite.config.mjs --host 127.0.0.1
```

Capture the hub at rest, hover/focus Library (purpose and 25-item bubble), and open Add files or photos. Check narrow phone width, keyboard focus visibility, bubble collision placement, pointer crossing, touch information toggle, dialog scrolling, and OS reduced motion. The fixture is signed out; owner upload and confirmed filing require a separate owner device check and are not live verified here.
