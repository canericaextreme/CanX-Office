# ChatGPT companion popup

## Scope
- Change only the global ChatGPT shortcut and focused tests.
- Preserve all pages, styling, authentication, database connections, Office Manager chat/voice, approvals, and working functions.
- Do not query or change the database, secrets, connectors, or deployment.

## Implementation
- Add a small browser-safe helper that opens the real `https://chatgpt.com/` in a named 520×760 resizable popup aligned to the right on desktop.
- Reuse and focus the same named popup on later clicks.
- Use a normal safe new tab on mobile or when the popup is blocked.
- Keep keyboard activation through the existing button and update its accessible label and tooltip to “Open ChatGPT beside the office.”
- Retain `noopener` and `noreferrer` protections and never embed ChatGPT.

## Validation
- Add focused unit tests for desktop popup dimensions/position, named-window reuse, mobile new-tab behavior, and blocked-popup fallback.
- Run focused tests, the full test suite, TypeScript checks, and the production build.
- Verify the header in desktop and mobile preview without publishing.
