# ChatGPT viewing tools: is the installed plugin a fixed package?

Diagnosis only. No edits, deploy, permission changes, reconnect or guessed menu steps.

## Corrected facts
- No refresh was done. The earlier "Refresh completed" note was wrong and is withdrawn.
- John's ChatGPT shows CanX Office as an **uploaded plugin**. Its menu offers Copy link, Uninstall, Download plugin ZIP, Upload new version and Delete plugin. The account menu offers Rename, Reconnect and Disconnect. There is no Refresh tools option.
- The app shows exactly the 10 original work/status tools.

## What the project holds (checked)
- The project contains **no ChatGPT plugin package** (no plugin manifest, ZIP source or list of tools). The only plugin references are notes in `docs/integration/astra-office-connection.md`, which predate the install.
- The server builds its tool list each time it is asked (`src/lib/office-mcp.ts` line 88): 10 tools without viewing, 15 with it.
- Deployed office-mcp v16 contains the viewing tools (your earlier source check).

## Leading hypothesis (not yet proven)
The uploaded plugin package may carry its own fixed copy of the tool definitions, taken when it was built. If so, ChatGPT would show that copy instead of asking the server again. That would explain 10 tools while the server can serve 15. Native Claude, by contrast, asks the remote server for its tool list directly, so it would not be affected the same way.

## Evidence that would prove or disprove it
1. **The plugin ZIP (read-only).** John uses the existing **Download plugin ZIP** item once and shares the file. Downloading changes nothing. I then inspect:
   - whether the manifest lists tools itself (names, schemas), and whether exactly the 10 appear;
   - the server address and sign-in settings it points to (the new assistant link should use `.../functions/v1/office-mcp`);
   - any version or date showing when it was built.
2. **Result:**
   - The ZIP lists the 10 tools itself: the cause is the fixed package. The fix is a new package version that adds the 5 viewing tools.
   - The ZIP only points at the server: the fixed-package hypothesis fails. Next comes the server-side evidence from the previous plan (reply size of a tool-list request in the Supabase logs, and the address shape check).

## Fix, only if step 2 confirms a fixed package (separate approval)
- Prepare an updated plugin package: same server address, same sign-in, same 10 tools unchanged, plus the 5 read-only viewing tools exactly as the server defines them.
- No server code, permission, credential or budget change.
- John installs it with the existing **Upload new version** item. That needs his explicit approval.
- Afterwards, verify in a new chat: 15 tools listed, then one room list, one saved room read and one room picture. The connection only counts as working once all three succeed.

## Not touched
Claude's merged PR98 timing work, office-mcp, room permissions, the authenticator step, the old Primary link.

## Status
- ChatGPT: reads records. Viewing tools are missing, most likely because of a fixed plugin package; that's unproven until the ZIP is checked.
- Claude: separate remote connection, timing handled with John.
- Elsie: not affected.
