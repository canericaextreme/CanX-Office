import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildWorkHandoffDraft,
  handoffStatusFromReply,
  HANDOFF_STATUS_EVENT,
  MANAGER_HANDOFF_EVENT,
  publishHandoffReceipt,
  redactSecrets,
  sendManagerHandoff,
} from "./companion-bridge";

const panel = readFileSync("src/components/office/CompanionWorkPanel.tsx", "utf8");
const manager = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
const realtime = readFileSync("src/lib/use-realtime-manager.ts", "utf8");

describe("work discussion handoff draft", () => {
  const turns = [
    { role: "user" as const, content: "First idea" },
    { role: "assistant" as const, content: "First reply" },
    { role: "user" as const, content: "Draft a task to review the RFP scanner idea" },
    { role: "assistant" as const, content: "Suggest a Yellow-track review task." },
  ];

  it("carries only the selected request and the reply right after it", () => {
    const draft = buildWorkHandoffDraft(turns, 2)!;
    expect(draft).toContain("Draft a task to review the RFP scanner idea");
    expect(draft).toContain("Suggest a Yellow-track review task.");
    expect(draft).not.toContain("First idea");
    expect(draft).not.toContain("First reply");
    expect(draft).toContain("not an approval");
    expect(draft).toMatch(/restate the actionable request/);
  });

  it("refuses non-user selections and stays bounded", () => {
    expect(buildWorkHandoffDraft(turns, 1)).toBeNull();
    expect(buildWorkHandoffDraft(turns, 99)).toBeNull();
    const long = buildWorkHandoffDraft([{ role: "user", content: "x".repeat(20000) }], 0)!;
    expect(long.length).toBeLessThanOrEqual(4000);
  });

  it("removes tokens, keys and pictures", () => {
    const out = redactSecrets(
      "token=abc123 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk sk-ABCDEFGHIJKLMNOPQRST data:image/png;base64,AAAA",
    );
    expect(out).not.toMatch(/abc123|eyJhbGci|sk-ABCD|base64/);
  });
});

describe("handoff status comes only from the real server result", () => {
  it("pre-provider refusals are blocked and may be resent", () => {
    for (const code of ["auth_not_ready", "limit_blocked", "health_check_failed", "context_unavailable"]) {
      const s = handoffStatusFromReply({ ok: false, code });
      expect(s.status).toBe("blocked");
      expect(s.canResend).toBe(true);
    }
  });
  it("provider errors and unknown results fail without resend (no duplicate paid call)", () => {
    expect(handoffStatusFromReply({ ok: false, code: "provider_error" })).toMatchObject({ status: "failed", canResend: false });
    expect(handoffStatusFromReply(null)).toMatchObject({ status: "failed", canResend: false });
  });
  it("distinguishes answered, saved change and pending approval", () => {
    expect(handoffStatusFromReply({ ok: true, actionResults: [] }).status).toBe("responded");
    expect(handoffStatusFromReply({ ok: true, actionResults: [{ status: "done" }] }).status).toBe("acted");
    expect(handoffStatusFromReply({ ok: true, actionResults: [{ status: "done" }, { status: "pending" }] }).status).toBe(
      "pending_approval",
    );
    expect(handoffStatusFromReply({ ok: true, actionResults: [{ status: "stopped" }] }).status).toBe("responded");
  });
  it("states persistence honestly", () => {
    expect(handoffStatusFromReply({ ok: true, persisted: true }).detail).toContain("Saved to Astra's memory");
    expect(handoffStatusFromReply({ ok: true, persisted: false }).detail).toContain("Not saved");
    expect(handoffStatusFromReply({ ok: true }).detail).not.toMatch(/saved to astra/i);
  });
});

describe("bridge events", () => {
  it("dispatches handoff and receipt events without sending anything else", () => {
    const events: string[] = [];
    const target = new EventTarget();
    vi.stubGlobal("window", {
      dispatchEvent: (e: Event) => { events.push(e.type); return target.dispatchEvent(e); },
    });
    sendManagerHandoff({ id: "h-1", source: "work_discussion", text: "hello", room: "", path: "/" });
    publishHandoffReceipt({ id: "h-1", status: "submitted", detail: "", at: "now" });
    expect(events).toEqual([MANAGER_HANDOFF_EVENT, HANDOFF_STATUS_EVENT]);
    vi.unstubAllGlobals();
  });
});

describe("wiring", () => {
  it("the Work panel shows an editable review draft with its source before handing off", () => {
    expect(panel).toContain('data-testid="canx-work-handoff-review"');
    expect(panel).toContain('data-testid="canx-work-handoff-text"');
    expect(panel).toContain("HANDOFF_SOURCE_LABEL.work_discussion");
    expect(panel).toContain('source: "screen_observation"');
    expect(panel).toContain("Office Work assistant</h2>");
    expect(panel).toContain("not your ChatGPT chat");
  });
  it("Astra's panel sends a handoff only from John's Send press, through the normal pipeline", () => {
    expect(manager).toContain('data-testid="astra-handoff-send"');
    expect(manager).toContain("send(undefined, handoff.id)");
    expect(manager).toContain("reportHandoff(handoffId, handoffStatusFromReply(reply))");
    expect(manager).toContain("reportHandoff(handoffId, handoffStatusFromReply(null))");
    // Receiving a handoff never calls the server.
    const listener = manager.slice(manager.indexOf("const onHandoff"), manager.indexOf("MANAGER_HANDOFF_EVENT, onHandoff"));
    expect(listener).not.toMatch(/sendChat|send\(/);
    expect(listener).toContain('status: "drafted"');
  });
  it("voice never leaves a superseded or wordless request unanswered", () => {
    expect(realtime).toContain("Not submitted: a newer spoken request replaced this one");
    expect(realtime).toContain("Astra did not receive the words of this request");
  });
});
