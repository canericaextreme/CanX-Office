import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  askWorkWith,
  allowWorkRequest,
  sanitizeWorkInput,
  sanitizedWorkDetail,
  WORK_REQUEST_LIMIT,
  WORK_SYSTEM_PROMPT,
  type WorkDeps,
} from "./companion-work.functions";

const dockSource = readFileSync("src/components/office/CompanionDock.tsx", "utf8");
const panelSource = readFileSync("src/components/office/CompanionWorkPanel.tsx", "utf8");
const workSource = readFileSync("src/lib/companion-work.functions.ts", "utf8");
const managerSource = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
const bridgeSource = readFileSync("src/lib/companion-bridge.ts", "utf8");

const baseDeps = (over: Partial<WorkDeps> = {}): WorkDeps => ({
  verifySignedIn: async () => ({ ok: true, aal: "aal1", userId: "u1", email: "j@x" }) as never,
  allowRequest: () => true,
  fetchImpl: (async () =>
    new Response(JSON.stringify({ output_text: "Here is the draft." }), { status: 200 })) as unknown as typeof fetch,
  openaiKey: "sk-test",
  model: "gpt-test",
  ...over,
});

describe("ChatGPT Work panel belongs to the companion", () => {
  it("opens from the companion's own Work button", () => {
    expect(dockSource).toContain("CompanionWorkPanel");
    expect(dockSource).toContain("const toggleWork");
    expect(dockSource).toContain('aria-label={workOpen ? "Close the ChatGPT Work window"');
    expect(panelSource).toContain('aria-label="ChatGPT Work"');
    expect(panelSource).toContain("ChatGPT Work</h2>");
  });

  it("has its own close, minimize, input, Send button and plain states", () => {
    expect(panelSource).toContain("Close the ChatGPT Work window");
    expect(panelSource).toContain("Minimize the ChatGPT Work window");
    expect(panelSource).toContain("canx-work-input");
    expect(panelSource).toContain("Send\n            </button>");
    for (const state of ["Ready", "Working", "Completed", "Error"]) {
      expect(panelSource).toContain(`"${state}"`);
    }
  });

  it("never opens an external window or an iframe", () => {
    for (const source of [dockSource, panelSource]) {
      expect(source).not.toContain("window.open");
      expect(source).not.toContain("iframe");
      expect(source).not.toContain("chatgpt.com");
    }
  });

  it("stops Chat when Work opens and closes Work when Chat starts", () => {
    expect(dockSource).toContain("if (!workOpen) chat.stop();");
    expect(dockSource).toContain("if (!chat.on) setWorkOpen(false);");
  });
});

describe("Work is fully independent of the Office Manager", () => {
  it("imports no Manager module, task, event or spending guard", () => {
    for (const source of [workSource, panelSource, dockSource]) {
      expect(source).not.toContain("manager.functions");
      expect(source).not.toContain("manager-work.functions");
      expect(source).not.toContain("manager_tasks");
      expect(source).not.toContain("OfficeManager");
      expect(source).not.toContain("reserveAiCall");
      expect(source).not.toContain("spending limit");
      expect(source).not.toContain("COMPANION_WORK_EVENT");
    }
  });

  it("leaves no companion Work listener in the Office Manager or the bridge", () => {
    expect(managerSource).not.toContain("COMPANION_WORK_EVENT");
    expect(managerSource).not.toContain("companion-bridge");
    expect(bridgeSource).not.toContain("COMPANION_WORK_EVENT");
    expect(bridgeSource).not.toContain("requestCompanionWork");
  });

  it("writes nothing to the database and declares no tools", () => {
    expect(workSource).not.toContain("rest/v1");
    expect(workSource).not.toContain('"tools"');
    expect(workSource).not.toContain("tools:");
    expect(workSource).not.toContain("insert");
  });

  it("tells the model honestly that it is not the Office Manager", () => {
    expect(WORK_SYSTEM_PROMPT).toContain("NOT the Office Manager");
    expect(WORK_SYSTEM_PROMPT).toContain("cannot read, change, save or delete any office record");
  });
});

describe("Work server function safety", () => {
  it("verifies the signed-in session before any provider call", async () => {
    const order = ["verifySignedIn", "openaiKey", "model", "allowRequest", "fetchImpl"].map((token) =>
      workSource.indexOf(`deps.${token}`),
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    const denied = await askWorkWith(
      baseDeps({ verifySignedIn: async () => ({ ok: false, message: "Please sign in." }) as never }),
      "t",
      [{ role: "user", content: "hi" }],
    );
    expect(denied.code).toBe("auth_not_ready");
    expect(denied.text).toBe("");
  });

  it("keeps the permanent key server-side only", () => {
    expect(panelSource).not.toContain("OPENAI_API_KEY");
    expect(workSource).toContain('process.env["OPENAI_API_KEY"]');
    expect(workSource).toContain('process.env["OPENAI_WORK_MODEL"]');
    expect(workSource).toContain('process.env["OPENAI_MODEL"]');
  });

  it("returns an answer when everything is configured", async () => {
    const reply = await askWorkWith(baseDeps(), "t", [{ role: "user", content: "draft" }]);
    expect(reply.ok).toBe(true);
    expect(reply.text).toBe("Here is the draft.");
    expect(reply.model).toBe("gpt-test");
  });

  it("sanitizes provider failures and never uses the Manager spend wording", async () => {
    const refused = await askWorkWith(
      baseDeps({ fetchImpl: (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch }),
      "t",
      [{ role: "user", content: "x" }],
    );
    expect(refused.code).toBe("provider_error");
    expect(refused.detail).toBe("The AI provider connection needs attention.");
    for (const status of [undefined, 401, 404, 429, 500]) {
      expect(sanitizedWorkDetail(status)).not.toContain("spending limit");
      expect(sanitizedWorkDetail(status)).not.toContain("Bearer");
    }
  });

  it("uses its own rate protection, separate from the office spending guard", async () => {
    for (let i = 0; i < WORK_REQUEST_LIMIT; i += 1) expect(allowWorkRequest("work-user")).toBe(true);
    expect(allowWorkRequest("work-user")).toBe(false);
    const limited = await askWorkWith(baseDeps({ allowRequest: () => false }), "t", [
      { role: "user", content: "x" },
    ]);
    expect(limited.code).toBe("too_many_requests");
    expect(limited.detail).not.toContain("spending limit");
  });

  it("reports a missing server setting honestly", async () => {
    expect((await askWorkWith(baseDeps({ openaiKey: undefined }), "t", [])).missingSetting).toBe("OPENAI_API_KEY");
    expect((await askWorkWith(baseDeps({ model: undefined }), "t", [])).missingSetting).toBe("OPENAI_WORK_MODEL");
  });

  it("bounds and cleans the incoming messages", () => {
    const cleaned = sanitizeWorkInput({
      accessToken: 123,
      messages: [{ role: "system", content: "x" }, { role: "user", content: "ok" }, "bad"],
    });
    expect(cleaned.accessToken).toBe("");
    expect(cleaned.messages).toEqual([{ role: "user", content: "ok" }]);
  });
});
