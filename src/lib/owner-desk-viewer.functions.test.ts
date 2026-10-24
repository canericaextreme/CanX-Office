import { describe, expect, it, vi } from "vitest";
import { loadViewerDeskMemoryWith, type ViewerDeskDeps } from "@/lib/owner-desk-viewer.functions";

const viewer = { ok: true, userId: "owner-1", email: "", aal: "viewer", viewer: { assistant: "chatgpt", rooms: ["/owner-desk"] } } as const;

function deps(overrides?: Partial<ViewerDeskDeps>): ViewerDeskDeps {
  return {
    verifyRead: vi.fn().mockResolvedValue(viewer),
    get: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    ...overrides,
  };
}

describe("Owner's Desk read-only viewer copy", () => {
  it("reads tasks, approvals and changes with the viewer's own token and nothing else", async () => {
    const tasks = [{ id: "t1", title: "Task 1", status: "waiting", waiting_reason: "Queued" }];
    const get = vi.fn().mockImplementation((_token: string, path: string) => ({ ok: true, data: path.startsWith("manager_tasks") ? tasks : [] }));
    const d = deps({ get });
    const result = await loadViewerDeskMemoryWith(d, "viewer-token");
    expect(result).toEqual({ ok: true, readOnly: true, tasks, approvals: [], changes: [] });
    expect(get).toHaveBeenCalledTimes(3);
    for (const call of get.mock.calls) expect(call[0]).toBe("viewer-token");
    expect(get).toHaveBeenCalledWith("viewer-token", expect.stringContaining("manager_tasks?owner_id=eq.owner-1"));
  });

  it("refuses an owner session so the owner path is unchanged", async () => {
    const d = deps({ verifyRead: vi.fn().mockResolvedValue({ ok: true, userId: "owner-1", email: "john@example.com", aal: "aal2" }) });
    const result = await loadViewerDeskMemoryWith(d, "token");
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "forbidden" }));
    expect(d.get).not.toHaveBeenCalled();
  });

  it("fails closed when the viewing session is not confirmed", async () => {
    const d = deps({ verifyRead: vi.fn().mockResolvedValue({ ok: false, reason: "mfa_required", message: "Two-step verification is required." }) });
    const result = await loadViewerDeskMemoryWith(d, "token");
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "auth_not_ready" }));
    expect(d.get).not.toHaveBeenCalled();
  });

  it("fails closed when a read is refused", async () => {
    const d = deps({ get: vi.fn().mockResolvedValue({ ok: false, error: "Request failed (403)." }) });
    const result = await loadViewerDeskMemoryWith(d, "token");
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "context_unavailable" }));
  });
});
