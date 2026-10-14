# ChatGPT viewing tools: platform inventory vs server discovery (diagnosis only)

No code, deploy, publish, reconnect, refresh or approval in this step.

## Exact tool lists
Server (office-mcp v17, `src/lib/office-mcp.ts` line 88) with viewing set up, 15 tools:
1. get_office_connection_plan
2. get_office_status
3. read_office_records
4. write_office_record
5. read_office_skills
6. open_office_file
7. submit_office_build
8. relay_to_colleague
9. read_colleague_replies
10. check_office_builds
11. list_office_rooms
12. office_tour
13. read_room_brief
14. view_room
15. read_room_information

ChatGPT shows only 1–10. Missing: 11–15.

## What the evidence now supports
- **Plugin ZIP:** it holds only an app link (`dev-…` to `asdk_app_6ac7e872…`) and a manifest. It has no tools and no server address, so a fixed tool list inside the ZIP is ruled out.
- **Server:** office-mcp builds the tool list the same way for every caller. Nothing in the code depends on which assistant is asking. Viewing is set up once, when the service starts, from its own address.
- **Claude:** Brain records from 02:34 UTC show Claude took fresh Reception and Legal pictures after PR99. Those pictures go through `view_room` on the same office-mcp. So the server was offering and running the viewing tools then. If it still offers them now, it is not leaving them out for ChatGPT.
- **Supported diagnosis (strong, not yet proven):** ChatGPT is using its **own saved tool list for the app** (`asdk_app_…`), held on OpenAI's side. Either that list did not refresh at 02:58, or the refresh read a list that doesn't apply to this chat. One gap remains: Claude may have reached office-mcp through a different link or version.

## Why Lovable can't tell us ChatGPT's list
ChatGPT's app list is kept on OpenAI's side. Lovable can't see OpenAI's app records, ChatGPT's settings, or what a chat has loaded. Lovable can only read our own code and our Supabase records.

## Evidence that separates the two (read-only, from our side)
1. **office-mcp logs, 02:57–03:00 UTC.** Was there a POST from the OpenAI connector at the refresh?
   - No POST: ChatGPT never asked the server. That proves its list is saved on OpenAI's side.
   - POST: the server was asked. Check step 2.
2. **Reply size for that POST,** if the logs record it. A 15-tool reply is several kilobytes larger than a 10-tool reply. If it's the larger size, the server sent all 15 and ChatGPT didn't use them.
3. **Claude's own calls at 02:34 UTC in the same logs.** Same office-mcp address and version, with a `tools/call` for `view_room`. That proves the same deployment offered and ran viewing.
4. **Owner-scoped records only:** the Brain capture records and `office_view` audit rows show which assistant identity took each picture.

## Reading the results
```text
No OpenAI POST at refresh           -> ChatGPT saved list; server not asked
POST, large reply                   -> server sent 15; ChatGPT kept old list
POST, small reply                   -> server left them out at that moment (investigate startup address check)
Claude view_room on same version    -> server viewing works; server omission very unlikely
```

## If the saved ChatGPT list is confirmed
The fix is on ChatGPT's side, not in our code. Options for John, with no blind steps:
- Check the app's developer settings for tool syncing or a new version. This is a ChatGPT setting outside Lovable.
- Our server needs no change. A redeploy would not change ChatGPT's saved list.

## Status
- ChatGPT: reads records. Missing tools 11–15. Most likely cause: ChatGPT's own saved list. Not yet proven.
- Claude: viewing confirmed by the 02:34 pictures.
- Elsie: not affected.
