// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfficeManager } from "./OfficeManager";

const mock = vi.hoisted(() => ({
  transcript: null as null | ((role: "user" | "assistant", content: string, id: string) => void),
  request: null as null | ((text: string) => Promise<string>),
  stop: vi.fn(),
  server: vi.fn(async () => ({ ok: false, connected: false, message: "Offline fixture", readAt: new Date().toISOString() })),
  router: { state: { location: { pathname: "/" } }, navigate: vi.fn() },
}));

vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-start")>(),
  useServerFn: () => mock.server,
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => mock.router,
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/lib/owner-session", () => ({ useOwnerSession: () => ({
  signedIn: true, ownerId: "11111111-2222-3333-4444-555555555555",
  state: "owner", stepUpComplete: true, accessToken: "fixture-token", shared: false,
}) }));
vi.mock("@/lib/use-manager-memory", () => ({ useManagerMemory: () => ({ memory: null }) }));
vi.mock("@/lib/use-manager-voice", () => ({ useManagerVoice: () => ({
  phase: "idle", cancelListening: mock.stop, stopPlayback: mock.stop,
}) }));
vi.mock("@/lib/use-realtime-manager", () => ({
  DEFAULT_LIVE_VOICE_MODE: "relay",
  useRealtimeManager: (_token: unknown, _team: unknown, transcript: typeof mock.transcript, request: typeof mock.request) => {
    mock.transcript = transcript;
    mock.request = request;
    return { phase: "idle", on: false, stop: mock.stop };
  },
}));
vi.mock("./OfficeFiles", () => ({ OfficeFiles: () => null }));
vi.mock("./DecisionTracker", () => ({ DecisionTracker: () => null }));

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

describe("Elsie conversation recall in her panel", () => {
  it("recalls a completed conversation after Close/Open and after a page remount with account reads unavailable", async () => {
    let view = render(<OfficeManager />);
    fireEvent.click(screen.getByRole("button", { name: "Open Office Manager Elsie" }));
    act(() => {
      mock.transcript!("user", "Plan the Monday workshop", "completed-turn");
      mock.transcript!("assistant", "We agreed to review the tool inventory first.", "completed-turn");
    });
    await screen.findByText("We agreed to review the tool inventory first.");
    fireEvent.click(screen.getByRole("button", { name: /^Close$/ }));
    expect(screen.queryByText("We agreed to review the tool inventory first.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open Office Manager Elsie" }));
    expect(screen.getByText("We agreed to review the tool inventory first.")).toBeTruthy();
    expect(await mock.request!("What was our last conversation?")).toContain("tool inventory first");

    view.unmount();
    view = render(<OfficeManager />);
    fireEvent.click(screen.getByRole("button", { name: "Open Office Manager Elsie" }));
    await waitFor(() => expect(screen.getByText("We agreed to review the tool inventory first.")).toBeTruthy());
    const recall = await mock.request!("What was our last conversation?");
    expect(recall).toContain("Plan the Monday workshop");
    expect(recall).toContain("tool inventory first");
  });
});
