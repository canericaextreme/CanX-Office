import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { askDecisionWorkerWith, listDecisionsWith, submitDecisionWith, type DecisionDeps } from "./companion-decision.functions";
import { buildDecisionDraft, correlationFromDetail, decisionMarker, suggestWorker } from "./companion-decision";
import { askWorkWith } from "./companion-work.functions";

const OWNER = "11111111-1111-1111-1111-111111111111";
const ID = "h-abc12345-xyz9";

function fakeDb(opts: { failInsertAfterWrite?: boolean; failAssign?: boolean } = {}) {
  const tasks: any[] = [];
  const assigns: any[] = [];
  const calls: string[] = [];
  const rest: DecisionDeps["rest"] = vi.fn(async (_t, method, path, body) => {
    calls.push(`${method} ${path.split("?")[0]}`);
    const q = new URLSearchParams(path.split("?")[1] ?? "");
    if (path.startsWith("manager_tasks")) {
      if (method === "GET") {
        const like = q.get("detail");
        const id = q.get("id");
        let rows = tasks.filter((t) => (!id || t.id === id.slice(3)) && (!q.get("owner_id") || t.owner_id === q.get("owner_id")!.slice(3)));
        if (like) {
          const prefix = like.slice(5).replace(/\*$/, "");
          rows = rows.filter((t) => t.detail.startsWith(prefix));
        }
        return { ok: true, data: rows };
      }
      if (method === "POST") {
        const row = { id: `t-${tasks.length + 1}`, status: "open", worker: "", result: "", evidence: "", created_at: "c", updated_at: "u", ...body };
        tasks.push(row);
        return opts.failInsertAfterWrite ? { ok: false } : { ok: true, data: [row] };
      }
      if (method === "PATCH") {
        if (opts.failAssign) return { ok: false };
        const t = tasks.find((x) => x.id === q.get("id")!.slice(3));
        Object.assign(t, body);
        return { ok: true, data: [t] };
      }
    }
    if (path.startsWith("manager_assignments")) {
      if (method === "GET") return { ok: true, data: assigns.filter((a) => a.task_id === q.get("task_id")!.slice(3)).slice(-1) };
      if (method === "POST") {
        if (opts.failAssign) return { ok: false };
        const a = { id: `a-${assigns.length + 1}`, result: "", evidence: "", assigned_at: "x", ...body };
        assigns.push(a);
        return { ok: true, data: [a] };
      }
      if (method === "PATCH") {
        const a = assigns.find((x) => x.id === q.get("id")!.slice(3));
        Object.assign(a, body);
        return { ok: true, data: [a] };
      }
    }
    return { ok: true, data: null };
  });
  const deps: DecisionDeps = { verifyOwner: async () => ({ ok: true, userId: OWNER, email: "j@x", aal: "aal2" }), rest };
  return { deps, tasks, assigns, calls };
}

const draft = { accessToken: "t", correlationId: ID, source: "companion", request: "Review the October budget", outcome: "A short plan", workerId: "w-finance-records" };

describe("decision -> task -> assignment -> worker result", () => {
  it("saves one task with readback and assigns a real worker", async () => {
    const db = fakeDb();
    const r = await submitDecisionWith(db.deps, draft);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(db.tasks).toHaveLength(1);
    expect(correlationFromDetail(db.tasks[0].detail)).toBe(ID);
    expect(r.status.stage).toBe("assigned");
    expect(r.status.worker).toBe("Finance & Records");
    expect(db.assigns).toHaveLength(1);
    expect(db.tasks[0].status).not.toBe("done");
  });

  it("records the worker's real answer as evidence without marking done", async () => {
    const db = fakeDb();
    const sent = await submitDecisionWith(db.deps, draft);
    if (!sent.ok) throw new Error("setup");
    const consult = vi.fn(async () => ({
      ok: true, code: "ok", workerId: "w-finance-records", workerName: "Finance & Records", room: "finance", model: "m1",
      answeredAt: "2026-09-25T00:00:00Z", complete: true, text: "", detail: "", thread: [],
      answer: { conclusion: "Budget is under the ceiling.", evidenceUsed: ["12 receipts"], confidence: "medium", missingEvidence: [], nextStep: "Check October" },
    })) as any;
    const r = await askDecisionWorkerWith({ ...db.deps, consult }, { accessToken: "t", taskId: sent.status.taskId });
    expect(consult).toHaveBeenCalledTimes(1);
    expect(r.ok && r.status.stage).toBe("worker_answered");
    expect(db.assigns[0].result).toContain("Budget is under the ceiling.");
    expect(db.assigns[0].evidence).toContain("model m1");
    expect(db.tasks[0].status).toBe("in_progress");
  });

  it("a failed worker answer records nothing", async () => {
    const db = fakeDb();
    const sent = await submitDecisionWith(db.deps, draft);
    if (!sent.ok) throw new Error("setup");
    const consult = vi.fn(async () => ({ ok: false, answer: null, detail: "limit reached" })) as any;
    const r = await askDecisionWorkerWith({ ...db.deps, consult }, { accessToken: "t", taskId: sent.status.taskId });
    expect(r.ok).toBe(false);
    expect(db.assigns[0].result).toBe("");
  });

  it("without a worker the task waits for assignment", async () => {
    const db = fakeDb();
    const r = await submitDecisionWith(db.deps, { ...draft, workerId: "" });
    expect(r.ok && r.status.stage).toBe("awaiting_assignment");
    expect(db.assigns).toHaveLength(0);
  });

  it("an unconfirmed assignment leaves the task awaiting assignment, never faked", async () => {
    const db = fakeDb({ failAssign: true });
    const r = await submitDecisionWith(db.deps, draft);
    expect(r.ok && r.status.stage).toBe("awaiting_assignment");
    expect(r.ok && r.assignmentNote).toContain("could not be confirmed");
  });
});

describe("duplicates, reload and denial", () => {
  it("repeat clicks with the same id return the same task", async () => {
    const db = fakeDb();
    const a = await submitDecisionWith(db.deps, draft);
    const b = await submitDecisionWith(db.deps, draft);
    expect(db.tasks).toHaveLength(1);
    expect(b.ok && b.duplicate).toBe(true);
    expect(a.ok && b.ok && a.status.taskId === b.status.taskId).toBe(true);
  });

  it("an ambiguous insert failure finds the saved row instead of inserting again", async () => {
    const db = fakeDb({ failInsertAfterWrite: true });
    const r = await submitDecisionWith(db.deps, draft);
    expect(r.ok).toBe(true);
    const again = await submitDecisionWith(db.deps, draft);
    expect(db.tasks).toHaveLength(1);
    expect(again.ok && again.duplicate).toBe(true);
  });

  it("status survives reload: the list is read from records", async () => {
    const db = fakeDb();
    await submitDecisionWith(db.deps, draft);
    const list = await listDecisionsWith(db.deps, "t");
    expect(list.ok && list.items[0]?.correlationId).toBe(ID);
    expect(list.ok && list.items[0]?.stage).toBe("assigned");
  });

  it("a denied owner check touches no records", async () => {
    const db = fakeDb();
    db.deps.verifyOwner = async () => ({ ok: false, reason: "mfa_required" as any, message: "MFA needed" });
    const r = await submitDecisionWith(db.deps, draft);
    expect(r.ok).toBe(false);
    expect(db.calls).toHaveLength(0);
    expect((await listDecisionsWith(db.deps, "t")).ok).toBe(false);
  });

  it("rejects malformed ids and unknown workers before any write", async () => {
    const db = fakeDb();
    expect((await submitDecisionWith(db.deps, { ...draft, correlationId: "bad" })).ok).toBe(false);
    expect((await submitDecisionWith(db.deps, { ...draft, workerId: "w-fake" })).ok).toBe(false);
    expect(db.calls).toHaveLength(0);
  });

  it("an unreadable database sends nothing", async () => {
    const db = fakeDb();
    db.deps.rest = async () => ({ ok: false });
    const r = await submitDecisionWith(db.deps, draft);
    expect(r.ok).toBe(false);
  });
});

describe("draft and companion context", () => {
  it("builds an editable draft with source, request, outcome and worker suggestion", () => {
    const d = buildDecisionDraft([{ role: "user", content: "Check receipts" }, { role: "assistant", content: "Plan: reconcile.\nmore" }], 0, ID);
    expect(d?.request).toBe("Check receipts");
    expect(d?.outcome).toBe("Plan: reconcile.");
    expect(d?.workerId).toBe("w-finance-records");
    expect(decisionMarker(ID)).toBe(`[canx-handoff:${ID}]`);
    expect(suggestWorker("hello")).toBe("w-manager-office");
  });

  const base = {
    verifySignedIn: async () => ({ ok: true as const, userId: OWNER, email: "e", aal: "aal2" }),
    allowRequest: () => true,
    openaiKey: "k",
    model: "m",
    now: () => new Date("2026-09-25T00:00:00Z"),
  };
  it("labels loaded context with source and time", async () => {
    const fetchImpl = vi.fn(async (_u: any, init: any) => {
      expect(JSON.parse(init.body).instructions).toContain("SHARED CANX CONTEXT — read 2026-09-25T00:00:00.000Z from: Office records");
      return new Response(JSON.stringify({ output_text: "ok" }));
    }) as any;
    const r = await askWorkWith({ ...base, fetchImpl, loadContext: async () => ({ ok: true, text: "facts", sources: ["Office records"] }) }, "t", [{ role: "user", content: "hi" }]);
    expect(r.context?.loaded).toBe(true);
  });
  it("says plainly when no context could be loaded (no-connection state)", async () => {
    const fetchImpl = vi.fn(async (_u: any, init: any) => {
      expect(JSON.parse(init.body).instructions).toContain("NOT LOADED");
      return new Response(JSON.stringify({ output_text: "ok" }));
    }) as any;
    const r = await askWorkWith({ ...base, fetchImpl, loadContext: async () => ({ ok: false, message: "No database." }) }, "t", [{ role: "user", content: "hi" }]);
    expect(r.context).toMatchObject({ loaded: false, detail: "No database." });
  });
});

describe("wiring", () => {
  const panel = readFileSync("src/components/office/CompanionWorkPanel.tsx", "utf8");
  const manager = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
  it("both interfaces show the same tracked list from records", () => {
    expect(panel).toContain("<DecisionTracker");
    expect(manager).toContain("<DecisionTracker");
    expect(panel).toContain("CanX Office companion (OpenAI)");
    expect(panel).toContain("COMPANION_INFLIGHT_KEY");
  });
});
