# CanX Office subscription verification and ChatGPT shortcut

## Scope
- Preserve all existing rooms, styling, authentication, database connections, Manager voice/chat behavior, and working functions.
- Change only Subscription Watch and the always-visible Office navigation.
- Do not run migrations, access secrets, call providers, publish, or deploy.

## Subscription Watch
- Replace the AI Workers summary with the supplied verified aggregate: $0.20 spend, $25.00 limit, 0.8% usage, Partially verified, last verified September 11, 2026.
- Make the complete AI Workers row a focusable mouse/keyboard control with a strong focus state.
- Open an accessible detail dialog containing separate OpenAI and Claude records, the supplied evidence, and explicit Result and Evidence sections.
- Use blue for verified evidence, grey for unknown billing, and yellow only for the partially verified/attention state.
- Keep the verification figures read-only because this page has no established safe persistent verification store. Label this honestly rather than simulating saved edits.

## ChatGPT shortcut
- Add a labeled ChatGPT button with a speech icon to the global Office header, near existing controls without replacing the Office Manager.
- Open `https://chatgpt.com/` in a new tab with `noopener noreferrer` and tooltip text “Open ChatGPT in a new tab.”
- Do not embed ChatGPT or imply shared Office Manager memory or conversations.

## Technical details
- Reuse the existing dialog, button, tooltip, card, badge, and semantic color tokens.
- Keep mobile layout bounded so row details and header controls do not overflow.
- Add focused tests for the supplied subscription facts, provider states, evidence text, row accessibility, and safe ChatGPT link.
- Run focused tests, the full test suite, TypeScript checks, and the project build.
- Verify the preview at desktop and 390px mobile widths, including opening AI Workers and the ChatGPT link target.
