import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), rest: vi.fn() }));
vi.mock("./canx-backend.server", () => ({
  readBackendConfig: () => ({ url: "https://fixture", publishableKey: "fixture" }),
  verifyOwner: mocks.owner,
  restRequest: mocks.rest,
}));
import {
  writeLegalFiling as saveLegalFiling,
  readLegalFilings as getLegalFilings,
} from "./legal-room.server";
import { EMPTY_LEGAL_FILING, LEGAL_SOURCE } from "./legal-room";
const id = "12345678-1234-1234-1234-123456789012";
const input = {
  accessToken: "fixture",
  fileId: id,
  filing: {
    ...EMPTY_LEGAL_FILING,
    topic: "agreements",
    status: "Active" as const,
    dueDate: "2026-11-01",
  },
  expected: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue({ ok: true, userId: "owner" });
});
describe("owner-only legal filing persistence", () => {
  it("denies before reading records when owner verification fails", async () => {
    mocks.owner.mockResolvedValue({ ok: false, message: "Owner required" });
    await expect(saveLegalFiling(input)).rejects.toThrow("Owner required");
    expect(mocks.rest).not.toHaveBeenCalled();
  });
  it("rejects documents outside Legal before any write", async () => {
    mocks.rest.mockResolvedValue({ ok: true, body: [] });
    await expect(saveLegalFiling(input)).rejects.toThrow("not saved in Legal");
    expect(mocks.rest.mock.calls.every((c) => !c[3])).toBe(true);
    expect(mocks.rest.mock.calls[0]?.[2]).toContain("room=eq.legal");
    expect(mocks.rest.mock.calls[0]?.[2]).toContain("owner_id=eq.owner");
  });
  it("confirms exact readback and never rewrites the original", async () => {
    mocks.rest.mockImplementation(async (_c, _t, path, init) => {
      if (path.startsWith("office_files?")) return { ok: true, body: [{ id }] };
      if (path.startsWith("office_links?")) return { ok: true, body: [] };
      if (path.startsWith("office_notes?select"))
        return { ok: true, body: [{ detail: JSON.stringify(input.filing), source: LEGAL_SOURCE }] };
      return { ok: true, body: [{ id }] };
    });
    expect(await saveLegalFiling(input)).toEqual(input.filing);
    expect(
      mocks.rest.mock.calls
        .filter((c) => c[3])
        .every((c) => ["office_notes", "office_audit"].some((t) => c[2].startsWith(t))),
    ).toBe(true);
  });
  it("does not call a failed or stale readback success", async () => {
    mocks.rest.mockImplementation(async (_c, _t, path) => ({
      ok: true,
      body: path.startsWith("office_notes?select") ? [] : [{ id }],
    }));
    await expect(saveLegalFiling(input)).rejects.toThrow("could not be confirmed");
  });
  it("rejects concurrent changes and keeps the expected-content condition", async () => {
    mocks.rest.mockImplementation(async (_c, _t, path, init) => ({
      ok: true,
      body: init?.method === "PATCH" ? [] : [{ id }],
    }));
    await expect(
      saveLegalFiling({ ...input, expected: JSON.stringify(EMPTY_LEGAL_FILING) }),
    ).rejects.toThrow("changed elsewhere");
    expect(mocks.rest.mock.calls.find((c) => c[3]?.method === "PATCH")?.[2]).toContain(
      "detail=eq.",
    );
  });
  it("does not report malformed or failed labels as an empty room", async () => {
    mocks.rest.mockResolvedValue({ ok: false, body: null });
    await expect(getLegalFilings({ accessToken: "fixture" })).rejects.toThrow(
      "could not be loaded",
    );
    mocks.rest.mockResolvedValue({ ok: true, body: [{ id: "legal-" + id, detail: "broken" }] });
    await expect(getLegalFilings({ accessToken: "fixture" })).rejects.toThrow("needs repair");
  });
});
