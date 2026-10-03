# Active email-check sheen

## Scope
- Add a soft translucent yellow sweep to the existing email-check status only while `phase === "running"`.
- Keep the spinner and status wording visible to assistive technology.
- Stop the sweep immediately for success, partial results, and failures.
- Label partial completion clearly as “Partial — not all mail checked” with a steady yellow treatment and a practical retry note; do not imply automatic scanning.
- Preserve the receipt-zero investigation as an open item in the project roadmap.

## Technical details
- Add one reduced-motion-safe Tailwind v4 utility in the shared style sheet.
- Apply it only in the running branch of `CheckEmailsResult`; do not derive activity from saved completion data.
- Extend the focused rendering test to prove running animates while partial completion and failure do not.
- Verify the focused test and current preview build diagnostics. No Gmail call, saved-record change, or publication.
