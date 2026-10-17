import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runManagerChatWith, validate, VOICE_ANSWER_RULE, type ManagerDeps } from "./manager.functions";
import { hasSpokenWords, spokenOfficeAnswer, spokenText } from "./use-realtime-manager";
import type { OwnerVerification } from "./canx-backend.server";

const OWNER: OwnerVerification = { ok: true, userId: "owner-1", email: "o@example.com", aal: "aal2" };

function deps(extra: Partial<ManagerDeps> = {}) {
  const bodies: string[] = [];
  const d: ManagerDeps = {
    verifyOwner: async () => OWNER,
    reserve: async () => ({ allowed: true, reservationId: "r1", remainingToday: 10 }),
    settle: async () => undefined,
    buildContext: async () => ({ ok: true, text: "LIVE OFFICE CONTEXT" }),
    fetchImpl: vi.fn(async (input: unknown, init?: RequestInit) => {
      if (String(input).includes("/v1/models/")) return new Response("{}", { status: 200 });
      bodies.push(String(init?.body));
      return new Response(JSON.stringify({ output_text: "Short answer." }), { status: 200 });
    }) as unknown as typeof fetch,
    openaiKey: "sk-test-not-real",
    model: "gpt-test",
    ...extra,
  };
  return { d, bodies };
}
const ask = (voice?: boolean) => ({ accessToken: "t", messages: [{ role: "user" as const, content: "What is on the Work Board?" }], ...(voice ? { voice } : {}) });

describe("Standard voice asks the Office for a short spoken answer", () => {
  it("only a spoken turn carries the short-answer rule", async () => {
    const spoken = deps();
    await runManagerChatWith(spoken.d, ask(true));
    expect(spoken.bodies[0]).toContain("SPOKEN TURN");
    const typed = deps();
    await runManagerChatWith(typed.d, ask());
    expect(typed.bodies[0]).not.toContain("SPOKEN TURN");
    expect(VOICE_ANSWER_RULE).toMatch(/Never shorten a tool call/);
  });

  it("the token cap is unchanged so a long tool call is never cut off", async () => {
    const spoken = deps();
    await runManagerChatWith(spoken.d, ask(true));
    expect(JSON.parse(spoken.bodies[0]!).max_output_tokens).toBe(900);
  });

  it("the browser can set voice only to true", () => {
    expect(validate({ accessToken: "t", messages: [], voice: true }).voice).toBe(true);
    expect(validate({ accessToken: "t", messages: [], voice: "yes" }).voice).toBeUndefined();
  });

  it("Standard voice sends the flag; typed chat does not", () => {
    const manager = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
    expect(manager.match(/voice: true/g)).toHaveLength(1);
  });
});

describe("the owner's records are read together, not one after another", () => {
  it("memory and documents start before the office facts finish", async () => {
    const started: string[] = [];
    let releaseContext!: () => void;
    const contextGate = new Promise<void>(resolve => { releaseContext = resolve; });
    const { d } = deps({
      buildContext: async () => { started.push("context"); await contextGate; return { ok: true, text: "LIVE" }; },
      readContinuity: async () => { started.push("memory"); return { ok: true, text: "MEMORY", counts: { memory: 0, summaries: 0, recent: 0 } }; },
      readDocuments: async () => { started.push("documents"); return { text: "", sources: [], gaps: [] }; },
    });
    const pending = runManagerChatWith(d, ask(true));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(started.sort()).toEqual(["context", "documents", "memory"]);
    releaseContext();
    expect((await pending).ok).toBe(true);
  });

  it("a failed office read still stops before any paid call", async () => {
    const reserve = vi.fn();
    const { d } = deps({ buildContext: async () => { throw new Error("down"); }, reserve });
    const reply = await runManagerChatWith(d, ask(true));
    expect(reply.ok).toBe(false);
    expect(reserve).not.toHaveBeenCalled();
  });
});

describe("what Elsie says aloud", () => {
  it("record footers stay in the written answer but are not read aloud", () => {
    const written = "Reception is fresh.\n\nThe Claude button task is open.\n\nSource: Reception room snapshot, checked 18:12 UTC.\nSkill used: Office Manager — Skill Router, version 1.0.0.";
    expect(spokenText(written)).toBe("Reception is fresh.\n\nThe Claude button task is open.");
    expect(JSON.stringify(spokenOfficeAnswer(written))).not.toContain("Skill used");
    expect(spokenText("Selected skill: x")).toBe("Selected skill: x");
    // Live 17 Oct 20:46: Elsie's footer reads "Selected skill: …", which was still spoken.
    expect(spokenText("The Work Board has forty-one saved tasks.\n\nSelected skill: Office Manager — Skill Router version one point zero point zero.")).toBe("The Work Board has forty-one saved tasks.");
  });

  it("a sound with no words is not an Office request", () => {
    expect(hasSpokenWords("呃")).toBe(false);
    expect(hasSpokenWords("…")).toBe(false);
    expect(hasSpokenWords("OK.")).toBe(true);
    const hook = readFileSync("src/lib/use-realtime-manager.ts", "utf8");
    expect(hook).toContain('sessionMode === "relay" && payload.type === "conversation.item.input_audio_transcription.completed" && !hasSpokenWords(text)');
  });

  it("no sound is played when a request is taken (the chime was heard as words)", () => {
    const hook = readFileSync("src/lib/use-realtime-manager.ts", "utf8");
    expect(hook).not.toContain("playHeardChime");
    expect(hook).not.toContain("createOscillator");
  });
});
