# Connect "canerica's Google Drive" to Elsie and Claude

## Evidence (inspected, read-only)
- Authorised connection exists: "canerica's Google Drive", ID `std_01m44yhvz6fn98jh6ww5s8zrsq`, connector `google_drive`, OAuth, routed through Lovable's connector gateway, owner has access, linkable: yes.
- Not yet attached to this project ("is linked to project: no"). So today the office has no Drive access at runtime. The catalog entry and the chat-side access are not the same as the app's runtime access.
- Granted scope is only `drive.file`. Whole-Drive scopes (`drive`, `drive.readonly`, metadata) are available but not granted, and will stay that way.
- Practical meaning of `drive.file`: the office can see and edit only files it creates itself (or files explicitly opened to it). It cannot browse or search John's existing Drive. A request like "find my tax folder" will honestly answer "not visible with current permission".
- Existing pattern to copy: `src/lib/gmail-receipts.server.ts` calls the gateway (`connector-gateway.lovable.dev/google_mail/...`) with `LOVABLE_API_KEY` plus the connection key from server env. No SDK; plain `fetch` to Drive API v3 through `https://connector-gateway.lovable.dev/google_drive/drive/v3`.
- Shared action registry: `TOOLS` (line ~325) and `executeToolCalls` (line ~1145) in `src/lib/manager.functions.ts`. Claude's Office path (`claudeOfficeChat`) and Elsie use this same registry and owner/MFA/budget/approval checks, so one set of tools serves both.

## Blocker
Only one step: attach the connection to the project. No action is needed from John; it is done with the link tool once this plan is approved (it was not done now because this message is inspect-only). After linking, confirm the exact key name (expected `GOOGLE_DRIVE_API_KEY`).

## Smallest build
1. Link `std_01m44yhvz6fn98jh6ww5s8zrsq` to the project; read back the key names (no values).
2. New `src/lib/google-drive.server.ts`: gateway helper (owner-verified, AAL2), surfaces provider status/body, no retries. Operations:
   - `list_office_drive_files` (read; only files visible under `drive.file`, says so)
   - `read_office_drive_file` (read, text/metadata, size-capped)
   - `create_office_drive_file` (write; requires existing protected-action approval)
   - `update_office_drive_file` (write; approval)
   - No delete tool at all.
3. Add these to `TOOLS` + `executeToolCalls` in `manager.functions.ts`, so Elsie (typed and voice via `submit_office_request`) and Claude get identical tools. Writes go through the existing approval/risk path; results saved with readback like other actions.
4. Connections inventory (`connections-inventory.ts`) and Systems page: Drive shows "linked, selected-files only, not yet verified signed-in" — never "live" until a real signed-in call succeeds.
5. Tests: owner/MFA denial, missing key = not configured, scope-limited empty list wording, write requires approval, no delete, both providers see the same tools, no token in output. Update `docs/office-audit.md` and `AGENTS.md` rule.
6. Typecheck, tests, build; then commit/push/publish per standing instruction. No paid AI test, no Drive files read or created by me.

## Not included
- No scope expansion. Browsing existing Drive would need John to re-authorise with `drive.readonly`; only on his request.
