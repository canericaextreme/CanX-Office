# Diagnosis: room-picture tools missing from ChatGPT's connector

Diagnosis only — no code changes, no publishing, no credential or permission changes.

## Confirmed from the code

- The five viewing tools exist in the Office connector source: `list_office_rooms`, `office_tour`, `read_room_brief`, `view_room`, `read_room_information` (`src/lib/office-mcp-view.ts`). They are read-only, take no secrets, and are offered by `tools/list` whenever the view service address is configured (`src/lib/office-mcp.ts` line 88).
- In the current source, the connector (`supabase/functions/office-mcp/index.ts`) derives the view service address automatically from its own `SUPABASE_URL`; no separate secret is needed for the tools to appear. (The older install guide mentions a `CANX_VIEW_SERVICE_URL` secret — the current code no longer requires it.)
- The viewing tools were added to the connector on 10 Oct (commits `e81b5e67`, `51b56d0f`, `06bfbba1`). The verified install record (11 Oct) shows office-mcp v13 and office-view v1 deployed with these tools present. John now reports office-mcp v16 and office-view v3 ACTIVE.
- The ten tools John sees in ChatGPT (check_office_builds, get_office_connection_plan, get_office_status, open_office_file, read_colleague_replies, read_office_records, read_office_skills, relay_to_colleague, submit_office_build, write_office_record) match the connector's work/status tools exactly — the viewing five are simply absent from ChatGPT's copy of the tool list.

## Most likely cause (hypothesis, not proven from here)

ChatGPT's connector caches the tool list when the connection is installed or refreshed. John's installed connector appears to hold a tool list from before the viewing tools were deployed (or from a deployment where the view service address was not yet configured). The database, grants and office-view service can all be correct while ChatGPT simply never received the new tool list.

Not proven from here: the exact content of deployed office-mcp v16. If v16 genuinely lacks the view wiring, the fix is a redeploy instead (see below).

## Smallest fix — try in this order

1. **Connector refresh first (no code change):** in ChatGPT, refresh or reconnect the CanX Office connector once so it re-fetches `tools/list` from office-mcp v16. Then check whether `list_office_rooms` / `view_room` appear. This costs nothing and changes nothing server-side.
2. **If the tools still do not appear:** the deployed office-mcp v16 predates or lacks the view wiring. The fix is one redeploy of office-mcp from the current source (bundle via `node scripts/office-view/bundle-functions.mjs <folder>`, deploy `office-mcp.js`, keep its existing JWT setting). No database, grant or secret changes. Then refresh the connector once more.
3. **Only after the tools appear:** one real `view_room` call on an authorised room verifies the whole chain (grant, capture workflow, picture returned). A room picture is only "working" once a real picture comes back through ChatGPT.

## Claude's 60-second picture timeout (unverified, consistent with design)

A capture takes roughly 30–90 seconds (GitHub Actions start-up), and the connector waits up to 100 seconds for it. If Claude's client gives up at 60 seconds, the picture may still complete server-side while the client reports a timeout. This is a plausible explanation, not verified. If confirmed after the tools are reachable, the smallest honest fix is to tell the assistant the picture takes up to about 90 seconds and to retry the fetch rather than re-request the capture — no code change needed for the first test.

## Status by assistant

- ChatGPT: connected and reading records/status/files (confirmed by John); viewing tools not yet exposed — connector refresh is the next step.
- Claude: picture request timing out at 60 s — unverified from our side; explanation above.
- Elsie: not affected.

## Explicitly not done

No code edits, no redeploy, no publish, no grant or permission changes, no paid calls. Roadmap update for this task is noted here because plan mode blocks file edits; it will be recorded when edits are next allowed.
