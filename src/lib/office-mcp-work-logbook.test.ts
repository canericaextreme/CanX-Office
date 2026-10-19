import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OFFICE_COLLECTIONS, OFFICE_WORK_TOOLS } from "./office-mcp-work";

const sql = readFileSync(
  "supabase/migrations/20261019050000_office_work_events_assistant_read.sql",
  "utf8",
);
const allowed = sql
  .match(/_collection not in \(([^)]*)\)/)![1]!
  .match(/'([^']+)'/g)!
  .map((x) => x.slice(1, -1));

describe("assistants can read the Brain work logbook", () => {
  it("offers office_work_events in read_office_records, and the database accepts exactly the same list", () => {
    expect(OFFICE_COLLECTIONS).toContain("office_work_events");
    expect([...allowed].sort()).toEqual([...OFFICE_COLLECTIONS].sort());
  });

  it("is read-only: the write tool cannot target the logbook", () => {
    const write = OFFICE_WORK_TOOLS.find((t) => t.name === "write_office_record")!;
    const schema = write.inputSchema as { properties: { collection: { enum: string[] } } };
    expect(schema.properties.collection.enum).not.toContain("office_work_events");
  });

  it("keeps the same working-grant gate and returns newest lines first", () => {
    expect(sql).toContain(
      "if not canx_private.mcp_work_active() then raise exception 'Office working grant required'",
    );
    expect(sql).toContain("when _collection='office_work_events' then 'occurred_at desc, id desc'");
    expect(sql).toContain("where owner_id=$1");
  });
});
