import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPANION_WORK_EVENT } from "./companion-bridge";
import { clampCompanionPosition, readStoredPosition, COMPANION_POSITION_KEY } from "./companion-position";
import { CHAT_PHASE_LABEL, isChatActive, managerHandoffOutput, realtimeEventPhase } from "./use-realtime-chat";
import { realtimeSessionBody, sanitizedRealtimeDetail, MANAGER_HANDOFF_TOOL } from "./realtime-voice.functions";
import type { ManagerActionResult, ManagerReply } from "./manager.functions";

const dockSource = readFileSync("src/components/office/CompanionDock.tsx", "utf8");
const navSource = readFileSync("src/components/office/OfficeNav.tsx", "utf8");
const managerSource = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
const layoutSource = readFileSync("src/routes/_office.tsx", "utf8");
const chatSource = readFileSync("src/lib/use-realtime-chat.ts", "utf8");
const sessionSource = readFileSync("src/lib/realtime-voice.functions.ts", "utf8");

describe("compact CanX companion", () => {
  it("is mounted beside, not inside, the Office Manager", () => {
    expect(layoutSource).toContain("<CompanionDock />");
    expect(layoutSource).toContain("<OfficeManager />");
  });

  it("keeps a compact square footprint that drags from the whole shell", () => {
    expect(dockSource).toContain("h-28 w-28");
    expect(dockSource).toContain("sm:h-32 sm:w-32");
    expect(dockSource).toContain("canx-companion-drag-handle");
    expect(dockSource).toContain("onPointerDown={onPointerDown}");
    // Chat, Work and X must not begin a drag.
    expect(dockSource.match(/onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/g)).toHaveLength(3);
  });

  it("never opens an external window and never shows transcript text", () => {
    expect(dockSource).not.toContain("chatgpt");
    expect(dockSource).not.toContain("window.open");
    expect(dockSource).not.toContain("iframe");
    expect(dockSource).not.toMatch(/\{messages|interimTranscript|message\.content/);
  });

  it("runs Chat on its own conversation engine, not browser speech synthesis", () => {
    expect(dockSource).toContain("useRealtimeChat");
    expect(dockSource).not.toContain("requestCompanionChat");
    expect(chatSource).not.toContain("speechSynthesis");
    expect(chatSource).not.toContain("SpeechSynthesisUtterance");
    // The Office Manager panel keeps its own separate voice controls.
    expect(managerSource).toContain("useReadAloud");
    expect(managerSource).not.toContain("COMPANION_CHAT_EVENT");
  });

  it("keeps Work pointed at the existing Office Manager panel", () => {
    expect(dockSource).toContain("requestCompanionWork");
    expect(managerSource).toContain("COMPANION_WORK_EVENT");
    expect(COMPANION_WORK_EVENT).toBe("canx:companion-work");
  });

  it("shows a talking-head icon and pulses only while the conversation is active", () => {
    expect(dockSource).toContain("AssistantFace");
    expect(dockSource).toContain('active ? "animate-pulse motion-reduce:animate-none" : ""');
    expect(isChatActive("idle")).toBe(false);
    expect(isChatActive("connecting")).toBe(false);
    expect(isChatActive("error")).toBe(false);
    expect(isChatActive("listening")).toBe(true);
    expect(isChatActive("speaking")).toBe(true);
    expect(CHAT_PHASE_LABEL.needs_approval).toBe("Needs approval");
  });

  it("collapses to a restorable edge tab after X", () => {
    expect(dockSource).toContain("canx-companion-tab");
    expect(dockSource).toContain('aria-label="Restore the CanX companion"');
    expect(dockSource).toContain("canx.companion.hidden");
  });

  it("removes the duplicate header ChatGPT shortcut", () => {
    expect(navSource).not.toContain("chatgpt");
    expect(navSource).not.toContain("ChatGPT");
  });
});

describe("Chat conversation states", () => {
  it("follows the real conversation, including interruption and continued listening", () => {
    expect(realtimeEventPhase("input_audio_buffer.speech_started")).toBe("listening");
    expect(realtimeEventPhase("response.created")).toBe("thinking");
    expect(realtimeEventPhase("response.output_audio.delta")).toBe("speaking");
    expect(realtimeEventPhase("response.done")).toBe("listening");
    // Barge-in: a cancelled reply returns to listening rather than sticking.
    expect(realtimeEventPhase("response.cancelled")).toBe("listening");
    expect(realtimeEventPhase("something.else")).toBeNull();
  });

  it("keeps listening turn after turn without a canned one-shot greeting", () => {
    expect(chatSource).not.toContain("I'm listening, John");
    expect(sessionSource).toContain("semantic_vad");
  });
});

describe("Office Manager handoff and approval boundary", () => {
  const action = (status: ManagerActionResult["status"], detail: string): ManagerActionResult => ({
    name: "create_task",
    risk: "green" as ManagerActionResult["risk"],
    status,
    detail,
  });
  const reply = (over: Partial<ManagerReply>): ManagerReply =>
    ({
      ok: true,
      code: "ok",
      provider: "openai",
      state: "verified",
      model: "m",
      text: "",
      toolCalls: [],
      actionResults: [],
      ...over,
    }) as ManagerReply;

  it("explains a completed Manager result", () => {
    const out = managerHandoffOutput(
      reply({ text: "Three tasks are open.", actionResults: [action("done", "Task created.")] }),
    );
    expect(out.text).toContain("Three tasks are open.");
    expect(out.needsApproval).toBe(false);
  });

  it("reports parked work as waiting for John, never as done", () => {
    const out = managerHandoffOutput(reply({ actionResults: [action("pending", "Send the email")] }));
    expect(out.needsApproval).toBe(true);
    expect(out.text).toContain("Waiting for John's approval");
  });

  it("reports stopped work honestly", () => {
    const out = managerHandoffOutput(reply({ actionResults: [action("stopped", "Deploy production")] }));
    expect(out.needsApproval).toBe(true);
    expect(out.text).toContain("John has to do this himself");
  });

  it("passes a refusal through without inventing an answer", () => {
    const out = managerHandoffOutput({ ok: false, detail: "Not available." } as ManagerReply);
    expect(out.text).toBe("Not available.");
  });

  it("declares one explicit handoff tool to the Office Manager", () => {
    expect(MANAGER_HANDOFF_TOOL.name).toBe("ask_office_manager");
    expect(realtimeSessionBody("m", "i").session.tools).toHaveLength(1);
  });
});

describe("Chat session safety", () => {
  it("mints only a short-lived secret and never ships the CanX key", () => {
    expect(sessionSource).toContain("client_secrets");
    expect(chatSource).not.toContain("OPENAI_API_KEY");
    expect(chatSource).toContain("session.clientSecret");
  });

  it("verifies owner, model and budget before any provider call", () => {
    const order = ["verifyOwner", "openaiKey", "realtimeModel", "reserve", "fetchImpl"].map((token) =>
      sessionSource.indexOf(`deps.${token}`),
    );
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("fails safely and honestly, without leaking provider detail", () => {
    expect(sanitizedRealtimeDetail(401)).toBe("The AI provider connection needs attention.");
    expect(sanitizedRealtimeDetail(401)).not.toContain("Bearer");
    expect(sanitizedRealtimeDetail(404)).toContain("realtime voice model");
    expect(sanitizedRealtimeDetail(429)).toBe("The AI service is temporarily busy. Please try again shortly.");
    expect(sanitizedRealtimeDetail(500)).toBe("The AI service could not be reached. Please try again.");
    expect(sanitizedRealtimeDetail()).toBe("The AI service could not be reached. Please try again.");
  });

  it("never reuses the spending-limit wording for provider or config problems", () => {
    for (const status of [undefined, 401, 403, 404, 429, 500]) {
      expect(sanitizedRealtimeDetail(status)).not.toContain("spending limit");
    }
  });
});

describe("Chat error classification", () => {
  const SPEND_TEXT = "The CanX AI spending limit for this period has been reached.";

  const baseDeps = (over: Partial<RealtimeDeps> = {}): RealtimeDeps => ({
    verifyOwner: async () => ({ ok: true, aal: "aal1", userId: "u1" }) as never,
    reserve: async () => ({ allowed: true, reservationId: "r1", remainingToday: 10 }),
    buildContext: async () => ({ ok: true, text: "office facts" }) as never,
    fetchImpl: (async () =>
      new Response(JSON.stringify({ value: "ek_test", expires_at: 123 }), { status: 200 })) as unknown as typeof fetch,
    openaiKey: "sk-test",
    realtimeModel: DEFAULT_REALTIME_MODEL,
    ...over,
  });

  it("uses the verified gpt-realtime default when no override is configured", async () => {
    expect(DEFAULT_REALTIME_MODEL).toBe("gpt-realtime");
    expect(sessionSource).toContain('readSetting(process.env["OPENAI_REALTIME_MODEL"]) ?? DEFAULT_REALTIME_MODEL');
    const result = await createRealtimeSessionWith(baseDeps(), "token");
    expect(result.ok).toBe(true);
    expect(result.model).toBe("gpt-realtime");
  });

  it("shows the spend-limit text only when the budget guard is exhausted", () => {
    expect(budgetDenialDetail({ allowed: false, reason: "budget_limit", message: "x" })).toBe(SPEND_TEXT);
  });

  it("does not show the spend-limit text for rate limits or unavailable checks", () => {
    expect(budgetDenialDetail({ allowed: false, reason: "rate_limit", message: "x" })).toBe(
      "The AI service is temporarily busy. Please try again shortly.",
    );
    expect(budgetDenialDetail({ allowed: false, reason: "unavailable", message: "x" })).not.toContain("spending limit");
  });

  it("does not show the spend-limit text when the provider refuses credentials", async () => {
    const result = await createRealtimeSessionWith(
      baseDeps({ fetchImpl: (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch }),
      "token",
    );
    expect(result.code).toBe("provider_error");
    expect(result.detail).toBe("The AI provider connection needs attention.");
    expect(result.detail).not.toContain("spending limit");
  });

  it("does not show the spend-limit text when the provider is rate limiting", async () => {
    const result = await createRealtimeSessionWith(
      baseDeps({ fetchImpl: (async () => new Response("slow", { status: 429 })) as unknown as typeof fetch }),
      "token",
    );
    expect(result.detail).toBe("The AI service is temporarily busy. Please try again shortly.");
  });

  it("passes the exhausted budget message straight through", async () => {
    const result = await createRealtimeSessionWith(
      baseDeps({ reserve: async () => ({ allowed: false, reason: "budget_limit", message: "raw" }) }),
      "token",
    );
    expect(result.code).toBe("limit_blocked");
    expect(result.detail).toBe(SPEND_TEXT);
  });
});

describe("Chat and Office Manager stay independent", () => {
  it("keeps Chat state inside the realtime engine, not the Manager", () => {
    expect(dockSource).toContain("useRealtimeChat");
    expect(dockSource).not.toContain("managerChat");
    // The dock renders only its own chat error.
    expect(dockSource).toContain("chat.error");
  });

  it("never copies a Manager banner into the Chat companion", () => {
    expect(managerSource).not.toContain("useRealtimeChat");
    expect(managerSource).not.toContain("createRealtimeSession");
  });
});

describe("companion position", () => {
  const viewport = { width: 1280, height: 800 };
  const size = { width: 128, height: 128 };

  it("keeps an in-bounds position unchanged", () => {
    expect(clampCompanionPosition({ left: 400, top: 300 }, viewport, size)).toEqual({ left: 400, top: 300 });
  });

  it("clamps off-screen positions back inside the viewport", () => {
    expect(clampCompanionPosition({ left: -200, top: -50 }, viewport, size)).toEqual({ left: 0, top: 0 });
    expect(clampCompanionPosition({ left: 5000, top: 5000 }, viewport, size)).toEqual({ left: 1152, top: 672 });
  });

  it("handles viewports smaller than the control", () => {
    expect(clampCompanionPosition({ left: 50, top: 50 }, { width: 100, height: 100 }, size)).toEqual({
      left: 0,
      top: 0,
    });
  });

  it("reads only a valid saved position", () => {
    expect(COMPANION_POSITION_KEY).toBe("canx.companion.position");
    expect(readStoredPosition(JSON.stringify({ left: 12, top: 34 }))).toEqual({ left: 12, top: 34 });
    expect(readStoredPosition("not json")).toBeNull();
    expect(readStoredPosition(null)).toBeNull();
    expect(readStoredPosition(JSON.stringify({ left: "x", top: 1 }))).toBeNull();
  });
});
