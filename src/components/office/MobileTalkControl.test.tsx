// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileTalkControl } from "./MobileTalkControl";
afterEach(cleanup);
describe("reachable mobile Talk controls", () => {
  it("keeps owner verification and history loading gates, then permits a retry after error", () => {
    const onStart = vi.fn();
    const props = { verified: false, historyReady: false, on: false, status: "Ready", onStart, onStop: vi.fn() };
    const view = render(<MobileTalkControl {...props} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("authenticator");
    view.rerender(<MobileTalkControl {...props} verified />);
    expect(screen.getByRole("status").textContent).toContain("Loading conversation");
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<MobileTalkControl {...props} verified historyReady status="Elsie needs attention — see the message below." />);
    fireEvent.click(screen.getByRole("button", { name: "Talk to Elsie" }));
    expect(onStart).toHaveBeenCalledOnce();
  });
  it("allows cancellation during connection even if history is refreshing", () => {
    const onStop = vi.fn();
    render(<MobileTalkControl verified historyReady={false} on status="Connecting Elsie…" onStart={vi.fn()} onStop={onStop} />);
    fireEvent.click(screen.getByRole("button", { name: "End conversation" }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
