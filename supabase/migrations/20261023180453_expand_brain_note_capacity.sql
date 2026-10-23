-- John requested increasing Brain capacity rather than shortening handoffs, 23 Oct 2026.
-- Existing MCP handoffs accept up to 11,000 serialized UTF-8 bytes.
-- A 12,000-character storage bound accommodates that contract; RPC byte limits remain.
-- Preserve every note, owner check, RLS policy, grant, trigger and audit path.
alter table public.office_notes
  drop constraint office_notes_detail_check,
  add constraint office_notes_detail_check check (char_length(detail) <= 12000);
