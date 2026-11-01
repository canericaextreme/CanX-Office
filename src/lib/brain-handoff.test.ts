import { describe, expect, it } from "vitest";
import { officeMcpWorkWith } from "./office-mcp-work-service";
import { handoffNotes } from "./conversation-handoff";
const id = "handoff-latest-chatgpt";
const historyId = "handoff-job-chatgpt-job-123";
const content = {
  schema: "brain-handoff-v1",
  jobId: "job-123",
  assistant: "chatgpt",
  project: "CanX Office / project UUID unknown",
  repository: "canericaextreme/CanX-Office",
  decisions: "Focused draft",
  changes: "Verified save implementation",
  tests: "Fixture tests passed",
  status: "complete",
  blockers: "Live checks pending",
  nextStep: "Owner signed-in acceptance",
};
const data = { kind: "decision", title: "Material work", detail: JSON.stringify(content) };
function fixture() {
  const rows = new Map<string, { data: Record<string, unknown>; version: string }>();
  const calls: string[] = [];
  let version = 0;
  const faults = { write: false, loseReply: false, mismatch: false, read: false };
  const fetchImpl = async (url: RequestInfo | URL, init?: RequestInit) => {
    const name = String(url).split("/").pop()!;
    const args = JSON.parse(String(init?.body));
    calls.push(name);
    if (name === "canx_mcp_work_active") return Response.json(true);
    if (name === "canx_office_records") {
      if (faults.read) throw Error("offline");
      const row = rows.get(args._id);
      return Response.json({ records: row ? [row] : [] });
    }
    if (name !== "canx_write_office_record") throw Error("Underlying job must never be invoked");
    if (faults.write) throw Error("offline");
    const old = rows.get(args._id);
    if ((old?.version ?? null) !== args._expected_version)
      return Response.json(
        { message: "Record changed; read it again before updating" },
        { status: 409 },
      );
    const row = { data: { ...args._data, id: args._id }, version: String(++version) };
    if (faults.mismatch) row.data.detail = "different";
    rows.set(args._id, row);
    if (faults.loseReply) {
      faults.loseReply = false;
      throw Error("lost acknowledgement");
    }
    return Response.json({ ...row, saved: true });
  };
  const save = (overrides = {}) =>
    officeMcpWorkWith(
      { url: "https://example.test", key: "fixture", fetch: fetchImpl },
      "fixture",
      "write_office_record",
      { collection: "office_notes", id, data, ...overrides },
    );
  return { rows, calls, faults, save, fetchImpl };
}
describe("verified Brain completion through existing record tools", () => {
  it("saves full job evidence and reads it in a later session", async () => {
    const f = fixture();
    expect(await f.save()).toMatchObject({ verified: true, completion: "complete", historyId });
    const later = (await officeMcpWorkWith(
      { url: "https://example.test", key: "fixture", fetch: f.fetchImpl },
      "fixture",
      "read_office_records",
      { collection: "office_notes", id: historyId },
    )) as { records: { data: typeof data }[] };
    expect(JSON.parse(later.records[0]!.data.detail)).toEqual(content);
    const notes = handoffNotes([
      { ...f.rows.get(id)!.data, detail: JSON.stringify({ ...content, tests: "e".repeat(1200) }) },
    ]);
    expect(notes[0]!.detail).toContain("e".repeat(1200));
  });
  it("keeps failed writes and failed reads pending", async () => {
    const f = fixture();
    f.faults.write = true;
    expect(await f.save()).toMatchObject({ verified: false, completion: "pending" });
    f.faults.write = false;
    f.faults.read = true;
    expect(await f.save()).toMatchObject({ verified: false, completion: "pending" });
    expect(f.rows.size).toBe(0);
  });
  it("rejects readback mismatch even when the writer reported success", async () => {
    const f = fixture();
    f.faults.mismatch = true;
    expect(await f.save()).toMatchObject({ verified: false, completion: "pending" });
    expect(f.rows.has(id)).toBe(false);
  });
  it("recovers a lost save acknowledgement without repeating writes or work", async () => {
    const f = fixture();
    f.faults.loseReply = true;
    expect(await f.save()).toMatchObject({ completion: "pending" });
    expect(await f.save()).toMatchObject({ verified: true, completion: "complete" });
    const writes = f.calls.filter((c) => c === "canx_write_office_record").length;
    expect(await f.save()).toMatchObject({ verified: true });
    expect(f.calls.filter((c) => c === "canx_write_office_record")).toHaveLength(writes);
    expect(writes).toBe(2);
  });
  it("never overwrites conflicting evidence for a reused job ID", async () => {
    const f = fixture();
    await f.save();
    expect(
      await f.save({
        data: { ...data, detail: JSON.stringify({ ...content, changes: "different" }) },
      }),
    ).toMatchObject({ completion: "pending" });
    expect(f.calls.filter((c) => c === "canx_write_office_record")).toHaveLength(2);
  });
  it("preserves a newer latest handoff and requires its exact version", async () => {
    const f = fixture();
    f.rows.set(id, { data: { ...data, id, title: "newer" }, version: "new" });
    expect(await f.save()).toMatchObject({ completion: "pending" });
    expect(f.rows.get(id)!.data["title"]).toBe("newer");
    expect(await f.save({ expectedVersion: "new" })).toMatchObject({ verified: true });
  });
  it("does not turn a saved blocked job into complete", async () => {
    const f = fixture();
    expect(
      await f.save({
        data: { ...data, detail: JSON.stringify({ ...content, status: "blocked" }) },
      }),
    ).toMatchObject({ verified: true, completion: "blocked" });
  });
  it("refuses incomplete prose and leaves unrelated notes on the established path", async () => {
    const f = fixture();
    expect(
      await f.save({ data: { kind: "decision", title: "rule", detail: "remember to save" } }),
    ).toMatchObject({ completion: "pending" });
    expect(f.rows.size).toBe(0);
    expect(await f.save({ id: "unrelated-note" })).toMatchObject({ saved: true });
  });
});
