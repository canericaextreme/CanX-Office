Elsie room-image adapter — draft, 13 October 2026

Adds a request-driven image input to Elsie's typed chat using the existing office-view broker and Elsie grant. Existing snapshots still supply room text. No new identity, grant, key, database change, live provider call or deployment.

Passed: native Node adapter assertions for explicit intent, room route, freshness, checksum, broker identity, denial without retry, token exclusion and OpenAI image payload; git whitespace check.

Not run: manager integration tests, full suite, typecheck and production build. Dependency downloads were blocked by the execution environment's network policy. Do not merge or publish until these checks pass.

Not verified: live room image delivery, configured model image capability, voice image delivery, protected rooms, browser-closed captures, all-room acceptance. Current connector calls fail on a missing OAuth refresh token; owner reconnect remains separate.

Checks: node scripts/office-mcp/verify-elsie-room-image.mjs; bun run test; bun run typecheck; bun run build.
