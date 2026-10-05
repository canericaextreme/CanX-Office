// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(cleanup);
import { render, screen } from "@testing-library/react";
import { ElsieHandoffResult } from "./ClaudeBuildPanel";
import type { ManagerReply } from "@/lib/manager.functions";

const base: ManagerReply = { ok: true, code: "ok", provider: "openai", state: "verified", model: "m", text: "Sent to Claude.", toolCalls: [], actionResults: [] } as ManagerReply;
describe("Elsie handoff result in the Claude panel", () => {
  it("renders Elsie's verified action results, labelled as Elsie's", () => {
    render(<ElsieHandoffResult reply={{ ...base, actionResults: [{ name: "start_claude_build", risk: "green", status: "pending", detail: "GitHub accepted the Claude build request." }] }} />);
    expect(screen.getByRole("region", { name: "Elsie handoff result" }).textContent).toContain("carried out by Elsie, not by Claude");
    expect(screen.getByText(/start_claude_build/)).toBeTruthy();
    expect(screen.getByText(/pending: GitHub accepted/)).toBeTruthy();
  });
  it("says plainly when nothing was carried out or the handoff failed", () => {
    render(<ElsieHandoffResult reply={{ ...base, ok: false, text: "", detail: "Owner verification required." }} />);
    expect(screen.getByText("Owner verification required.")).toBeTruthy();
    expect(screen.getByText("No Office action was carried out.")).toBeTruthy();
  });
});
