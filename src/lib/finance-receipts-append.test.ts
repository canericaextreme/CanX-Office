import { describe, it, expect } from "vitest";
import { officeMcpWorkWith } from "./office-mcp-work-service";
import { validWorkArguments } from "./office-mcp-work";

// A stand-in for the database: it appends like canx_append_finance_receipts and serves read-back.
type Receipt = Record<string, unknown>;
const receipt = (id: string): Receipt => ({ id, vendor: "Lovable Labs Incorporated", date: "2026-08-30", total: 224, tax: 24, currency: "USD", notes: "Invoice W6JU2EYL-0010. Charged CA$326.99 at 1 USD = 1.4598 CAD. ".repeat(4) });
const fill = (bytes: number) => { const list: Receipt[] = []; while (JSON.stringify(list).length < bytes) list.push(receipt(`old-${list.length}`)); return list; };
function backend(start: Receipt[], opts: { corruptReadBack?: boolean } = {}) {
  const stored = structuredClone(start);
  const calls: { name: string; body: string }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const name = String(url).split("/rpc/")[1]!;
    const body = String(init?.body ?? "");
    calls.push({ name, body });
    if (name === "canx_mcp_work_active") return Response.json(true);
    if (name === "canx_append_finance_receipts") {
      const sent = (JSON.parse(body) as { _receipts: Receipt[] })._receipts;
      if (body.length > 12000) return Response.json({ message: "Invalid receipts batch" }, { status: 400 });
      const before = stored.length;
      const appended = sent.filter((r) => !stored.some((s) => s["id"] === r["id"]));
      stored.push(...structuredClone(appended));
      return Response.json({ saved: true, appended, alreadySaved: sent.filter((r) => !appended.includes(r)).map((r) => r["id"]), countBefore: before, countAfter: stored.length });
    }
    if (name === "canx_office_records") {
      const list = opts.corruptReadBack ? stored.map((r, i) => (i === stored.length - 1 ? { ...r, total: 0 } : r)) : stored;
      return Response.json({ records: [{ data: { doc: { kind: "canx-finance-receipts", receipts: list } } }] });
    }
    return Response.json({ message: "unexpected" }, { status: 500 });
  }) as unknown as typeof globalThis.fetch;
  const call = (receipts: Receipt[]) => officeMcpWorkWith({ url: "https://x", key: "k", fetch }, "t", "append_finance_receipts", { receipts }) as Promise<Record<string, unknown>>;
  return { stored, calls, call };
}

describe("append-only Finance receipt save", () => {
  it.each([["just under", 11_900], ["just over", 12_600], ["far over", 60_000]])("saves one receipt when the saved list is %s the 12,000-byte limit", async (_label, bytes) => {
    const start = fill(bytes);
    const db = backend(start);
    const result = await db.call([receipt("new-1")]);
    expect(JSON.stringify(start).length).toBeGreaterThanOrEqual(bytes);
    expect(result).toMatchObject({ confirmed: true, appended: ["new-1"], alreadySaved: [], countBefore: start.length, countAfter: start.length + 1 });
    expect(db.stored.slice(0, start.length)).toEqual(start);
    expect(db.stored.at(-1)).toEqual(receipt("new-1"));
    // Only the new receipt travels; the saved list is never sent back.
    const sent = db.calls.find((c) => c.name === "canx_append_finance_receipts")!.body;
    expect(sent).not.toContain("old-0");
    expect(sent.length).toBeLessThan(1_000);
  });

  it("still saves into a small list (the common case)", async () => {
    const db = backend([receipt("a"), receipt("b")]);
    expect(await db.call([receipt("c")])).toMatchObject({ confirmed: true, countAfter: 3 });
    expect(db.stored.map((r) => r["id"])).toEqual(["a", "b", "c"]);
  });

  it("takes twelve pending receipts in one batch or one at a time", async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({ id: `p-${i}`, vendor: `Vendor ${i}`, total: i * 10.5, date: "2026-10-07" }));
    const batch = backend(fill(11_700));
    expect(await batch.call(twelve)).toMatchObject({ confirmed: true });
    expect(batch.stored.slice(-12)).toEqual(twelve);
    const single = backend(fill(11_700));
    for (const r of twelve) expect(await single.call([r])).toMatchObject({ confirmed: true });
    expect(single.stored.slice(-12)).toEqual(twelve);
  });

  it("a retry is reported as already saved, not duplicated", async () => {
    const db = backend([receipt("a")]);
    expect(await db.call([receipt("a")])).toMatchObject({ confirmed: true, appended: [], alreadySaved: ["a"] });
    expect(db.stored).toHaveLength(1);
  });

  it("does not report success when the read-back differs", async () => {
    const db = backend([receipt("a")], { corruptReadBack: true });
    expect(await db.call([receipt("b")])).toMatchObject({ confirmed: false, notConfirmed: ["b"] });
  });

  it("checks the tool arguments", () => {
    expect(validWorkArguments("append_finance_receipts", { receipts: [receipt("a")] })).toBe(true);
    expect(validWorkArguments("append_finance_receipts", { receipts: [] })).toBe(false);
    expect(validWorkArguments("append_finance_receipts", { receipts: ["text"] })).toBe(false);
    expect(validWorkArguments("append_finance_receipts", { receipts: Array.from({ length: 26 }, (_, i) => receipt(String(i))) })).toBe(false);
    expect(validWorkArguments("append_finance_receipts", { receipts: [receipt("a")], doc: {} })).toBe(false);
  });
});
