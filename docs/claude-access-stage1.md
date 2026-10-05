# Stage 1 — shared Office status

Owner scope: Stage 1 only, approved October 5, 2026. Stage 2–4 await separate approval.

`getOfficeStatus` calls the read-only server reader. It verifies the signed-in owner before reading anything; existing row security still applies. The POST server-function transport performs GET-only database reads. No new database tables, roles, policies, provider calls or credentials are introduced.

The Claude panel provides **Shared Office status — Stage 1 → Read Office status**, including portable version-1 JSON for later approved Claude/Elsie/ChatGPT adapters. No adapter or additional assistant permission is enabled here.

Projects come only from saved import records and separate saved plan labels. Existing locator rules apply: published does not mean ready; unknown remains unknown. Paging reads up to 2,000 rows per source, and marks incomplete reads. Open tasks expose IDs, states and stable project links only; task text may contain archive material and stays excluded.

## Common log

`docs/office-shared-log.json` is the canonical portable log for Elsie, Claude and ChatGPT. It contains genuine dated Stage 0 observations and the owner's Stage 1 decision, not generated project status. The status includes the latest 100 shared entries and latest 20 decisions/problems, with truncation disclosed.

During authorised repository work, append an entry with a unique ID, UTC date, actual actor, kind (`decision`, `task`, `problem`, `observation`, `action`), `audience: "office-status"`, plain summary and evidence. Preserve previous entries. Normal Git commits/PRs retain history; never rewrite published history. Failed/proposed work must be labelled as such. Exclude credentials, private journals/photos/books and raw provider responses. The parser withholds recognised credential-shaped text as an extra safeguard; arbitrary secrets cannot be recognised perfectly, so use curated operational summaries only.

This is the common file contract, not the legacy device-only activity list. Automatic runtime writes from questions/builds/PR events are Stage 4 and remain unimplemented. Future logging needs a durable append mechanism retaining this export contract; a writable production filesystem is not assumed.

## Evidence and limits

Successful database reads verify only those sources. Anthropic/GitHub labels report server configuration presence and explicitly disclose no live check. Google AI remains unknown; Google Drive is a different service. Stage 0 settings remain dated observations, never current health claims.

Tests cover owner denial, private-field exclusion, stage truth, failed sources, paging, malformed logs, credential-shaped text and read-only behavior. Fixtures do not constitute signed-in live verification. Compare the signed-in status with Projects/Work Board before accepting live behavior. Question/answer, build approval and automatic logging tests belong to later stages. Lovable Anthropic authentication remains untested.
