# Mobile landscape draft — 15 October 2026

Draft checkout changes only. No production calls, publication, push, merge, credentials, authentication, permissions, dependencies or infrastructure changes.

## Changes

- Phone map retains a readable wide canvas with horizontal swiping instead of compressing all room labels into the phone width. A phone-only hint recommends landscape; portrait remains usable. Browser orientation is not forcibly locked.
- Mobile Elsie conversation and composer sit side by side in landscape. Talk/End is sticky at the top of the composer, before the text box. The launcher is fully visible without hover. The two phone launchers have separate corners and widths that fit narrow screens.
- Mobile manager sizing follows VisualViewport resize and pan events for the software keyboard and rotation, with safe-area padding. Header tools scroll horizontally. Desktop sizing and desktop Talk controls remain in place.
- ChatGPT uses direct same-tab navigation on phones, avoiding the separate-tab handoff; browser Back returns to Office. Desktop retains new-tab navigation. Blocked browser storage no longer crashes the companion dock or its stored-position reader.

## ChatGPT diagnosis and boundary

The actual Open ChatGPT button is a normal link to https://chatgpt.com/, with no iframe, loading promise or Office spinner. It previously always requested a new tab. The independent realtime voice engine is not started by this button; changing its connection timeout would not fix this navigation. The draft addresses mobile navigation and a reproducible local storage failure, but neither is established as the cause on John's phone.

A spinner after navigation is on the external ChatGPT page. Its root cause cannot be established from this checkout or detected cross-origin. This draft does not claim that external failure is fixed. Testing that page, its sign-in state, browser/app handoff and connectivity requires the owner's device; any account or authorization change remains outside scope. No provider/account changes were made.

## Automated checks

- 57 targeted Vitest tests pass across seven files: mobile viewport hooks, mobile companion rendering, mobile Talk controls, manager overlay contracts, companion dock/work behavior and office map registry.
- Simulated 390×844 portrait → 844×390 landscape → 844×170 keyboard viewport, including viewport pan and listener cleanup; desktop viewport styles remain unset.
- Rendered Talk tests cover verification/history loading gates, retry availability after an error and cancellation while connecting/history refreshes. Launcher tests cover mobile same-tab versus desktop new-tab behavior, no Office loading gate, and browser-storage exceptions. Existing companion tests use fixture provider errors; no live providers were called.
- TypeScript and whitespace checks are recorded in the final task response.

These DOM simulations do not lay out CSS or prove touch-target visibility. No graphical browser/device runner is available in this environment. No build/deployment acceptance is claimed.

## Device acceptance still required

On John's phone, check Safari/Chrome and the installed app if applicable:

1. Rotate portrait/landscape, swipe the map to every room and confirm launchers do not overlap. Check notches and browser bars. Confirm desktop appearance in a normal desktop browser.
2. Open Elsie in each orientation. Check Talk, End, Close, room links and horizontally scrollable toolbar; open the keyboard, type, rotate with it open and dismiss it. Confirm transcript/composer scroll independently and the Talk button remains visible.
3. While signed out or awaiting verification/history, confirm the Talk control cannot bypass existing gates. With the owner signed in, test microphone permission denial, offline/failed connection, retry and cancellation; confirm actual audio on the phone.
4. Open ChatGPT from the phone link, confirm it leaves Office for chatgpt.com, then use Back. If ChatGPT spins, record whether this also occurs opening chatgpt.com directly in the normal browser and whether it occurs only in the installed app. External sign-in/browser investigation remains outstanding; do not mark ChatGPT or Office health verified from these fixture tests.
