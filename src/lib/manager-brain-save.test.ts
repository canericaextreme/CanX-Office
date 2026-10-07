import { describe, it, expect, vi } from "vitest";
import { saveManagerBrainWith } from "./manager-brain-save";
import type { WorkbenchDeps } from "./manager-work.functions";

const input = {
  accessToken: "owner-token",
  currentRequest: "Save this receipt in CanX Brain",
  title: "Filing test receipt",
  content: "Reported filing test passed; original restored.",
};
function fixture() {
  const records: Record<string, unknown>[] = [];
  const rest = vi.fn(
    async (_token: string, method: string, _path: string, body?: Record<string, unknown>) => {
      if (method === "POST") records.push(body!);
      return { ok: true, data: [...records] };
    },
  );
  const deps = {
    verifyOwner: vi.fn(async () => ({
      ok: true as const,
      userId: "owner-1",
      email: "owner@test.invalid",
      aal: "aal2",
    })),
    rest: rest as unknown as WorkbenchDeps["rest"],
  };
  return { deps, rest, records };
}
describe("Elsie Brain save", () => {
  it("saves as the verified owner and returns exact readback; repeating does not append", async () => {
    const f = fixture();
    const result = await saveManagerBrainWith(f.deps, input);
    expect(result).toMatchObject({ ok: true, title: input.title, content: input.content });
    expect(f.records[0]).toMatchObject({
      owner_id: "owner-1",
      source: "CanX Brain: conversation summary",
      detail: input.content,
    });
    await saveManagerBrainWith(f.deps, input);
    expect(f.records).toHaveLength(1);
    expect(f.rest.mock.calls.every((call) => call[0] === input.accessToken)).toBe(true);
    expect(
      f.rest.mock.calls
        .filter((call) => call[1] === "GET")
        .every((call) => call[2].includes("owner_id=eq.owner-1")),
    ).toBe(true);
  });
  it.each([
    "Read Brain",
    "Do not save this to Brain",
    "How would you save this to Brain?",
    "File this in Drive",
  ])("refuses unauthorized or hypothetical request: %s", async (currentRequest) => {
    const f = fixture();
    expect((await saveManagerBrainWith(f.deps, { ...input, currentRequest })).ok).toBe(false);
    expect(f.rest).not.toHaveBeenCalled();
  });
  it("denies non-owner without database access", async () => {
    const f = fixture();
    const deps = {
      ...f.deps,
      verifyOwner: async () => ({
        ok: false as const,
        reason: "not_owner" as const,
        message: "Owner required",
      }),
    };
    expect((await saveManagerBrainWith(deps, input)).ok).toBe(false);
    expect(f.rest).not.toHaveBeenCalled();
  });
  it("does not claim success when persisted content differs", async () => {
    const f = fixture();
    f.rest.mockImplementation(async (_token, method, _path, body) => {
      if (method === "POST") f.records.push({ ...body, detail: "Different content" });
      return { ok: true, data: [...f.records] };
    });
    expect((await saveManagerBrainWith(f.deps, input)).ok).toBe(false);
  });
  it("does not write if preflight read fails", async () => {
    const f = fixture();
    f.rest.mockResolvedValue({ ok: false, data: [] });
    expect((await saveManagerBrainWith(f.deps, input)).ok).toBe(false);
    expect(f.rest.mock.calls.some((call) => call[1] !== "GET")).toBe(false);
  });
  it("rejects oversized content rather than silently filing truncated text", async () => {
    const f = fixture();
    expect((await saveManagerBrainWith(f.deps, { ...input, content: "x".repeat(4001) })).ok).toBe(
      false,
    );
    expect(f.rest).not.toHaveBeenCalled();
  });
});
