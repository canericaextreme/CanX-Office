// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const h = vi.hoisted(() => ({
  ask: vi.fn(),
  session: {
    ownerId: "owner-one",
    signedIn: true,
    stepUpComplete: true,
    accessToken: "owner-token",
  },
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => h.ask }));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => h.session }));
vi.mock("@/lib/manager.functions", () => ({ claudeOfficeChat: {} }));
vi.mock("@/lib/office-health", () => ({ currentBuildVersion: () => "test-build" }));
import { ClaudeOfficeChatPanel } from "./ClaudeOfficeChatPanel";
const reply = { ok: true, text: "Claude answered", actionResults: [], persisted: true };
const message = () => screen.getByLabelText("Message to Claude") as HTMLTextAreaElement;
const send = () => screen.getByRole("button", { name: "Send message to Claude" });
beforeEach(() => {
  h.ask.mockReset();
  h.session = {
    ownerId: "owner-one",
    signedIn: true,
    stepUpComplete: true,
    accessToken: "owner-token",
  };
  window.sessionStorage.clear();
});
afterEach(cleanup);
describe("one Office Claude conversation", () => {
  it("accepts a short follow-up and includes the previous answer in the next request", async () => {
    h.ask.mockResolvedValue(reply);
    render(<ClaudeOfficeChatPanel />);
    fireEvent.change(message(), { target: { value: "Hi" } });
    fireEvent.click(send());
    await screen.findByText("Claude answered");
    expect(h.ask.mock.calls[0]![0].data.messages).toEqual([{ role: "user", content: "Hi" }]);
    fireEvent.change(message(), { target: { value: "why?" } });
    fireEvent.click(send());
    await waitFor(() => expect(h.ask).toHaveBeenCalledTimes(2));
    expect(h.ask.mock.calls[1]![0].data.messages).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Claude answered" },
      { role: "user", content: "why?" },
    ]);
    expect(screen.getByText("Recent Office memory saved and read back.")).toBeTruthy();
  });
  it("retains the draft and shows a refused call without retrying or claiming a save", async () => {
    h.ask.mockResolvedValue({
      ...reply,
      ok: false,
      text: "",
      detail: "Budget blocked",
      persisted: false,
    });
    render(<ClaudeOfficeChatPanel />);
    fireEvent.change(message(), { target: { value: "Check the build" } });
    fireEvent.click(send());
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Budget blocked");
    expect(message().value).toBe("Check the build");
    expect(h.ask).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Recent Office memory saved and read back.")).toBeNull();
  });
  it("explains missing owner verification before any call", () => {
    h.session.stepUpComplete = false;
    render(<ClaudeOfficeChatPanel />);
    fireEvent.change(message(), { target: { value: "Hello" } });
    expect((send() as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByText("Complete owner verification in the Office to send a message."),
    ).toBeTruthy();
    expect(h.ask).not.toHaveBeenCalled();
  });
  it("keeps completed messages and a draft across a room remount without putting credentials in recovery", async () => {
    h.ask.mockResolvedValue(reply);
    const first = render(<ClaudeOfficeChatPanel />);
    fireEvent.change(message(), { target: { value: "Hello" } });
    fireEvent.click(send());
    await screen.findByText("Claude answered");
    fireEvent.change(message(), { target: { value: "Next question" } });
    first.unmount();
    render(<ClaudeOfficeChatPanel />);
    expect(message().value).toBe("Next question");
    expect(screen.getByText("Claude answered")).toBeTruthy();
    expect(window.sessionStorage.getItem("canx-claude-conversation:owner-one")).not.toContain(
      "owner-token",
    );
    expect(h.ask).toHaveBeenCalledTimes(1);
  });
  it("does not display another owner's messages or send automatically", () => {
    window.sessionStorage.setItem(
      "canx-claude-conversation:another-owner",
      JSON.stringify({
        messages: [{ role: "assistant", content: "Private other reply" }],
        draft: "Other draft",
      }),
    );
    render(<ClaudeOfficeChatPanel />);
    expect(screen.queryByText("Private other reply")).toBeNull();
    expect(message().value).toBe("");
    expect(h.ask).not.toHaveBeenCalled();
  });
  it("shows an uncertain submission failure and keeps the message for recovery", async () => {
    h.ask.mockRejectedValue(new Error("transport failed"));
    render(<ClaudeOfficeChatPanel />);
    fireEvent.change(message(), { target: { value: "Claude build this" } });
    fireEvent.click(send());
    expect((await screen.findByRole("alert")).textContent).toContain(
      "check the Work Board and build status",
    );
    expect(message().value).toBe("Claude build this");
    expect(h.ask).toHaveBeenCalledTimes(1);
  });
  it("does not duplicate a pending action after changing rooms and restores its confirmed reply", async () => {
    let resolve!: (value: unknown) => void;
    h.ask.mockReturnValue(
      new Promise((result) => {
        resolve = result;
      }),
    );
    const first = render(<ClaudeOfficeChatPanel />);
    fireEvent.change(message(), { target: { value: "Claude check the build" } });
    fireEvent.click(send());
    first.unmount();
    render(<ClaudeOfficeChatPanel />);
    expect((send() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(send());
    expect(h.ask).toHaveBeenCalledTimes(1);
    resolve(reply);
    await screen.findByText("Claude answered");
    expect(message().value).toBe("");
  });
});
