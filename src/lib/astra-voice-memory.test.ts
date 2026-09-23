import { describe, expect, it, vi } from "vitest";
import { VoiceTurnPairer } from "./voice-turns";
import { recordVoiceTurnWith } from "./astra-voice-memory.functions";
import { createManagerRealtimeSessionWith, type ManagerRealtimeDeps } from "./manager-realtime.functions";
import { CONTINUITY_UNAVAILABLE, readAstraContinuity, type Rest } from "./astra-continuity";
import type { OwnerVerification } from "./canx-backend.server";
import { readFileSync } from "node:fs";

const OWNER_ID = "11111111-2222-3333-4444-555555555555";
const OWNER: OwnerVerification = { ok: true, userId: OWNER_ID, email: "o@example.com", aal: "aal2" };
const ok = (body: unknown) => ({ ok: true, status: 200, body });

function realtimeDeps(extra: Partial<ManagerRealtimeDeps>, sent: { body: string }): ManagerRealtimeDeps {
  return {
    verifyOwner: async () => OWNER,
    reserve: async () => ({ allowed: true, reservationId: "r", remainingToday: 1 }),
    settle: async () => undefined,
    buildContext: async () => ({ ok: true, text: "LIVE OFFICE CONTEXT" }),
    fetchImpl: vi.fn(async (_u: unknown, init?: RequestInit) => { sent.body = String(init?.body); return new Response(JSON.stringify({ value: "ek_test" })); }) as unknown as typeof fetch,
    openaiKey: "sk-test-not-real",
    realtimeModel: "gpt-realtime",
    ...extra,
  };
}

describe("live voice receives durable memory", () => {
  it("reads memory for the verified owner before the session is created and includes it", async () => {
    const sent = { body: "" };
    const order: string[] = [];
    const rest: Rest = async (path) => path.startsWith("astra_memory") ? ok([{ title: "Voice goal", content: "Remember me", active: true }]) : ok([]);
    const result = await createManagerRealtimeSessionWith(realtimeDeps({
      readContinuity: async (_t, id) => { order.push(`read:${id}`); return readAstraContinuity(rest, id); },
      reserve: async () => { order.push("reserve"); return { allowed: true, reservationId: "r", remainingToday: 1 }; },
    }, sent), "t", []);
    expect(result.ok).toBe(true);
    expect(order).toEqual([`read:${OWNER_ID}`, "reserve"]);
    expect(sent.body).toContain("LIVE OFFICE CONTEXT");
    expect(sent.body).toContain("Voice goal");
  });

  it("continues on office records but states the gap when memory fails", async () => {
    const sent = { body: "" };
    const result = await createManagerRealtimeSessionWith(realtimeDeps({ readContinuity: async () => { throw new Error("down"); } }, sent), "t", []);
    expect(result.ok).toBe(true);
    expect(sent.body).toContain("NOT READ");
    expect(CONTINUITY_UNAVAILABLE).toContain("NOT READ");
  });

  it("never reads memory when the owner is not verified", async () => {
    const readContinuity = vi.fn();
    const result = await createManagerRealtimeSessionWith(realtimeDeps({ verifyOwner: async () => ({ ok: false, reason: "mfa_required", message: "x" }), readContinuity }, { body: "" }), "t", []);
    expect(result.ok).toBe(false);
    expect(readContinuity).not.toHaveBeenCalled();
  });
});

describe("voice turns are persisted once", () => {
  it("pairs a plain spoken exchange into one turn", () => {
    const p = new VoiceTurnPairer();
    expect(p.feed("user", "What is next?")).toBeNull();
    expect(p.feed("assistant", "The round table.")).toEqual({ user: "What is next?", answer: "The round table." });
    expect(p.feed("assistant", "extra")).toBeNull();
  });

  it("skips a spoken turn already saved through the typed Manager path", () => {
    const p = new VoiceTurnPairer();
    p.feed("user", "Check approvals");
    p.markServerSaved("Check approvals");
    expect(p.feed("assistant", "Two approvals are waiting.")).toBeNull();
    p.feed("user", "Thanks, what else?");
    expect(p.feed("assistant", "Nothing else.")).not.toBeNull();
  });

  it("the browser wires the pairer to both the voice save and the typed path", () => {
    const src = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
    expect(src).toContain("voicePairerRef.current.feed(role, content)");
    expect(src).toContain("if (reply.ok) voicePairerRef.current.markServerSaved(request);");
  });

  it("server saves a voice turn once for the verified owner with readback", async () => {
    const inserts: string[] = [];
    const rest: Rest = async (path, init) => {
      if (init?.method === "POST") { inserts.push(String(init.body)); return ok(JSON.parse(String(init.body)).map((r: object) => ({ ...r, id: 1 }))); }
      return ok([]);
    };
    const result = await recordVoiceTurnWith({ verifyOwner: async () => OWNER, rest: () => rest }, { accessToken: "t", user: "hi", answer: "hello" });
    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(JSON.parse(inserts[0]!).every((r: { owner_id: string }) => r.owner_id === OWNER_ID)).toBe(true);
  });

  it("server refuses to save without a verified owner", async () => {
    const rest = vi.fn() as unknown as Rest;
    const result = await recordVoiceTurnWith({ verifyOwner: async () => ({ ok: false, reason: "no_session", message: "You are not signed in." }), rest: () => rest }, { accessToken: "", user: "a", answer: "b" });
    expect(result.ok).toBe(false);
    expect(rest).not.toHaveBeenCalled();
  });
});
