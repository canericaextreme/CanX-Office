import { describe, expect, it } from "vitest";
import { readOfficeStatusWith, type OfficeStatusDeps } from "./office-status.server";
import { parseSharedLog } from "./office-status";
import { readFileSync } from "node:fs";
const pid = "00000000-0000-4000-8000-000000000001";
const at = "2026-10-05T16:10:00Z";
const owner = { ok: true as const, userId: "owner", email: "", aal: "aal2" };
const imported = { id: `lovable-project:${pid}`, source: "Lovable project import", title: "Highways", detail: JSON.stringify({ version: 1, provider: "Lovable", projectId: pid, name: "Highways", description: "PRIVATE BOOK TEXT", published: true }) };
const plan = { id: "plan", source: "Project register: plan", title: pid, detail: JSON.stringify({ stage: "testing", instructions: "PRIVATE JOURNAL TEXT", nextMove: "PRIVATE PHOTO DETAILS" }) };
const log = JSON.stringify({ version: 1, entries: [{ id: "decision", at, actor: "John", kind: "decision", audience: "office-status", summary: "Stage 1 only.", evidence: "Owner request" }, { id: "private", at, actor: "John", kind: "observation", audience: "archive", summary: "PRIVATE ARCHIVE TEXT", evidence: "private" }] });
const deps = (extra: Partial<OfficeStatusDeps> = {}): OfficeStatusDeps => ({
  verify: async () => owner, configured: { anthropic: true, github: true }, now: () => new Date(at), sharedLogRaw: log,
  read: async path => ({ ok: true, status: 200, body: path.startsWith("office_notes?") ? [imported, plan] : [{ id: "task-1", status: "waiting", project: pid, updated_at: at, title: "PRIVATE TASK TEXT", result: "PRIVATE RESULT" }] }), ...extra,
});
describe("Stage 1 Office status", () => {
  it("verifies the owner before reading anything", async () => {
    let reads = 0;
    const r = await readOfficeStatusWith(deps({ verify: async () => ({ ok: false, reason: "not_owner", message: "Access refused" }), read: async () => { reads++; throw Error("must not read"); } }), "token");
    expect(r).toEqual({ ok: false, message: "Access refused" }); expect(reads).toBe(0);
  });
  it("exports saved stages and deliberately shared decisions without archive text", async () => {
    const r = await readOfficeStatusWith(deps(), "token"); if (!r.ok) throw Error("expected status");
    expect(r.status.projects[0]).toMatchObject({ id: pid, name: "Highways", stage: "testing" });
    expect(r.status.recentDecisions[0]?.summary).toBe("Stage 1 only.");
    expect(r.status.openTasks[0]).toMatchObject({ id: "task-1", status: "waiting", projectId: pid });
    expect(JSON.stringify(r)).not.toContain("PRIVATE");
    expect(r.status.tools.find(t => t.name === "Anthropic")?.state).toBe("configured-unverified");
    expect(r.status.tools.find(t => t.name === "Google AI")?.state).toBe("unknown");
  });
  it("never promotes a published flag to a verified project stage", async () => {
    const r = await readOfficeStatusWith(deps({ read: async p => ({ ok: true, status: 200, body: p.startsWith("office_notes") ? [imported] : [] }) }), "token");
    if (!r.ok) throw Error("expected status"); expect(r.status.projects[0]?.stage).toBe("unknown");
  });
  it("reports denied or failed sources without claiming the Office is empty", async () => {
    for (const status of [403, 500]) {
      const r = await readOfficeStatusWith(deps({ read: async () => ({ ok: false, status, body: "PRIVATE ERROR TEXT" }) }), "token");
      if (!r.ok) throw Error("expected partial status");
      expect(r.status.complete).toBe(false); expect(r.status.sources[0]?.state).toBe(status === 403 ? "denied" : "failed");
      expect(r.status.knownProblems.join(" ")).toContain("missing data is not an empty Office");
      expect(JSON.stringify(r)).not.toContain("PRIVATE ERROR TEXT");
    }
  });
  it("pages records and exposes its cap without guessing from missing tasks", async () => {
    const paths: string[] = [];
    const r = await readOfficeStatusWith(deps({ read: async path => { paths.push(path); return { ok: true, status: 200, body: path.startsWith("office_notes") ? [imported] : Array.from({ length: 200 }, (_, i) => ({ id: `task-${Number(new URLSearchParams(path.split("?")[1]).get("offset")) + i}`, status: "open", project: pid })) }; } }), "token");
    if (!r.ok) throw Error("expected status");
    expect(r.status.sources[1]).toMatchObject({ count: 2000, truncated: true }); expect(r.status.projects[0]?.stage).toBe("unknown");
    expect(r.status.complete).toBe(false); expect(paths).toHaveLength(12);
  });
  it("requests only allowlisted sources and task metadata fields", async () => {
    const paths: string[] = [];
    await readOfficeStatusWith(deps({ read: async path => { paths.push(path); return { ok: true, status: 200, body: [] }; } }), "token");
    expect(paths).toHaveLength(2); expect(paths[0]).toContain("source=in.");
    expect(decodeURIComponent(paths[0]!)).toContain('"Lovable project import","Project register: plan"');
    expect(paths[1]).toContain("select=id,status,project,updated_at");
    expect(paths.join()).not.toMatch(/office_files|office_links|finance|conversation|round_tables|storage|journal/);
  });
  it("rejects malformed logs and withholds credential-shaped strings", async () => {
    expect(parseSharedLog("bad json")).toBeNull();
    const fake = "sk-ant-test-THIS-IS-A-FAKE-CREDENTIAL";
    const unsafeLog = JSON.stringify({ version: 1, entries: [{ id: "test", at, actor: "Claude", kind: "action", audience: "office-status", summary: fake, evidence: "fixture" }] });
    const r = await readOfficeStatusWith(deps({ sharedLogRaw: unsafeLog }), "token");
    expect(JSON.stringify(r)).not.toContain(fake); expect(JSON.stringify(r)).toContain("credential-shaped text withheld");
    const failed = await readOfficeStatusWith(deps({ sharedLogRaw: "{}" }), "token"); if (!failed.ok) throw Error("expected status");
    expect(failed.status.complete).toBe(false);
  });
  it("has no AI dispatch or database write in the new status route", () => {
    const wrapper = readFileSync("src/lib/office-status.functions.ts", "utf8");
    expect(wrapper).toContain('verify: backend.verifySignedIn'); expect(wrapper).toContain('{ method: "GET" }');
    const reader = readFileSync("src/lib/office-status.server.ts", "utf8");
    expect(reader).not.toMatch(/fetch\(|invokeOfficeClaude|runClaudeBuild|runCodexBuild|method: "(?:POST|PATCH|DELETE)"/);
  });
});
