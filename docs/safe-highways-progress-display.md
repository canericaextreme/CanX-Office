# Safe Highways assignment progress display

Analytics and Safe Highways share `SafeHighwaysProgress`, reading only Work Board task
`43da2350-e1aa-4d22-a1da-9885295888be` through the existing owner/MFA verification and owner-scoped REST reader. The read is independent of recent-task list limits. No task, evidence or database records are written by this display.

The initial owner report is labelled explicitly: inventory begun, acceptance tests not performed, no migration job running. These are starting observations, not live runtime claims. Missing or failed task reads show unavailable, not initial progress. Open/assigned task states never establish a running job. Saved build receipts are labelled recorded, not current runtime.

Existing task result, evidence or detail can carry these optional labelled lines (result takes precedence):

- `Milestone: ...`
- `Acceptance tests: ...`
- `Last verified: ...` (record the actual verification time and timezone)
- `Blocker: ...` (the existing waiting reason takes precedence)
- `Next action: ...`

All saved evidence, result and detail remain readable as plain text; no saved text becomes HTML or instructions. Missing verification is explicitly unrecorded, regardless of task update time. Missing next action includes a labelled suggested inventory/evidence step. This change does not establish a new evidence-writing process or perform acceptance tests.

Refresh assignment re-reads the canonical row in either room. Both layouts use wrapping text, a single-column layout on small screens and touch-size controls. Local fixture tests cannot verify owner saved-data access or real-device layout. Before acceptance, check both rooms signed in with MFA on a current build, refresh recorded evidence, and inspect a narrow phone screen with long evidence text. This local implementation does not publish, invoke production, migrate Safe Highways or start a job.
