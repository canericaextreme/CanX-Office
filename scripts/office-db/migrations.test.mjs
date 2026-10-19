// Run: node --test scripts/office-db/migrations.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { plan, isOnHold, buildApplySql, readMigrationFiles, parseFileName } from "./migrations.mjs";

// What the live database had recorded on 18 Oct 2026 (read-only list from Supabase).
const LIVE = [
  ["20260923200738", "astra_memory_core"], ["20260923200827", "astra_conversation_summaries"],
  ["20260923200848", "astra_recent_context"], ["20260923200913", "astra_context_retrieval"],
  ["20260924145959", "restore_astra_owner_memory_access"], ["20260924154327", "document_knowledge"],
  ["20260925204340", "astra_conversation_checkpoints"], ["20261003004015", "private_office_file_collection"],
  ["20261003005219", "explicit_task_waiting_status"], ["20261003005440", "private_office_web_links"],
  ["20261003025721", "owner_office_file_delete"], ["20261003193225", "canx_receipt_ingestion_setup"],
  ["20261008181553", "office_mcp_scoped_access"], ["20261008201412", "office_mcp_work_access"],
  ["20261010024041", "office_colleague_relay_work_grant"], ["20261011012433", "office_view_delegation"],
  ["20261011012738", "office_view_search_path"], ["20261011031034", "office_assistant_identity_isolation"],
  ["20261016021437", "elsie_scoped_task_claim_20261016"], ["20261018000946", "office_build_permission_status"],
].map(([version, name]) => ({ version, name }));

const repo = readMigrationFiles("supabase/migrations");

test("against the real repo and live history, only the work-event logbook is applied", () => {
  const p = plan(repo, LIVE);
  assert.deepEqual(p.apply.map((f) => f.file), ["20261019021500_office_work_events.sql"]);
});

test("Elsie's held extended-sessions file is never applied automatically", () => {
  const p = plan(repo, LIVE);
  assert.ok(!p.apply.some((f) => f.name === "elsie_extended_sessions"));
  assert.ok(isOnHold(repo.find((f) => f.name === "elsie_extended_sessions").sql));
});

test("older files already live under other dates are not re-run", () => {
  const p = plan(repo, LIVE);
  for (const f of p.apply) assert.ok(f.version > "20261018000946");
});

test("a held file stays held even when asked for by name", () => {
  const p = plan(repo, LIVE, ["20261017013000_elsie_extended_sessions.sql"]);
  assert.equal(p.apply.length, 1); // only the newer logbook
  assert.ok(p.skipped.some((s) => s.file.includes("elsie_extended_sessions") && /hold/.test(s.reason)));
});

test("nothing is applied twice", () => {
  const after = [...LIVE, { version: "20261019021500", name: "office_work_events" }];
  assert.equal(plan(repo, after).apply.length, 0);
});

test("a recorded name under a different version counts as applied", () => {
  const files = [{ file: "20991231000000_office_work_events.sql", version: "20991231000000", name: "office_work_events", sql: "select 1;" }];
  const p = plan(files, [{ version: "20261019030000", name: "office_work_events" }]);
  assert.equal(p.apply.length, 0);
});

test("bad or unknown requested names stop the run", () => {
  assert.ok(plan(repo, LIVE, ["x.sql"]).errors.length);
  assert.ok(plan(repo, LIVE, ["20990101000000_missing.sql"]).errors.length);
});

test("hold markers", () => {
  assert.ok(isOnHold("-- Draft only. x\ncreate table t();"));
  assert.ok(isOnHold("create table t();\n-- canx:hold until reviewed"));
  assert.ok(!isOnHold("-- Office work events\ncreate table t();"));
});

test("apply SQL is one transaction with its history record, safely quoted", () => {
  const f = { ...parseFileName("20261019021500_office_work_events.sql"), sql: "select '$x$';" };
  const sql = buildApplySql(f);
  assert.match(sql, /^begin;/);
  assert.match(sql, /commit;$/);
  assert.match(sql, /insert into supabase_migrations\.schema_migrations/);
  const tag = sql.match(/\$canx_[0-9a-f]+\$/)[0];
  assert.ok(!f.sql.includes(tag));
});
