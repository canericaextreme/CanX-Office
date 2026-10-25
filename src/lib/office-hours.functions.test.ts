import { describe, it, expect, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
}));
import { readHours, saveHours, handleOfficeHours } from "./office-hours.functions";
import { REQUESTED_START, type HoursRecord } from "./office-hours";
const record: HoursRecord = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "elapsed",
  start: REQUESTED_START,
  end: REQUESTED_START + 10000,
  activeEnd: REQUESTED_START + 5000,
};
const backend = vi.hoisted(() => ({
  readBackendConfig: vi.fn(() => ({})),
  verifyOwner: vi.fn(),
  restRequest: vi.fn(),
  DENY_MESSAGES: { backend_not_configured: "Not configured" },
}));
vi.mock("./canx-backend.server", () => backend);
describe("owner-only durable Office Hours records", () => {
  it("uses insert-ignore for idempotent retries and checks exact content before confirming", async () => {
    const rest = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, body: null })
      .mockResolvedValueOnce({
        ok: true,
        body: [{ id: record.id, detail: JSON.stringify(record) }],
      });
    await saveHours(rest, "owner", [record]);
    const init = rest.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toEqual({ Prefer: "resolution=ignore-duplicates,return=minimal" });
    expect(JSON.parse(String(init.body))[0].owner_id).toBe("owner");
  });
  it("does not confirm failed writes or conflicting readbacks", async () => {
    await expect(
      saveHours(vi.fn().mockResolvedValue({ ok: false }), "owner", [record]),
    ).rejects.toThrow("save failed");
    const rest = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, body: [{ id: record.id, detail: "{}" }] });
    await expect(saveHours(rest, "owner", [record])).rejects.toThrow("readback");
  });
  it("paginates saved history rather than silently truncating totals", async () => {
    const rest = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        body: Array.from({ length: 500 }, () => ({
          id: record.id,
          detail: JSON.stringify(record),
        })),
      })
      .mockResolvedValueOnce({ ok: true, body: [] });
    expect(await readHours(rest)).toHaveLength(500);
    expect(rest.mock.calls[1]![0]).toContain("offset=500");
  });
  it("uses an inclusive server-time cursor for incremental history reads", async () => {
    const rest = vi.fn().mockResolvedValue({ ok: true, body: [] });
    await readHours(rest, "2026-10-25T01:00:00.000Z");
    expect(rest.mock.calls[0]![0]).toContain("created_at=gte.2026-10-25T01%3A00%3A00.000Z");
  });
  it("fails closed on damaged records and failed reads", async () => {
    await expect(
      readHours(vi.fn().mockResolvedValue({ ok: true, body: [{ id: record.id, detail: "{}" }] })),
    ).rejects.toThrow("review");
    await expect(readHours(vi.fn().mockResolvedValue({ ok: false }))).rejects.toThrow(
      "could not be read",
    );
  });
  it("denies non-owner, incomplete MFA and viewer before storage calls", async () => {
    for (const owner of [
      { ok: false, message: "MFA required" },
      { ok: false, message: "Not owner" },
      { ok: true, userId: "viewer", viewer: { assistant: "x" } },
    ]) {
      backend.verifyOwner.mockResolvedValue(owner);
      backend.restRequest.mockClear();
      expect((await handleOfficeHours({ accessToken: "fixture", records: [] })).ok).toBe(false);
      expect(backend.restRequest).not.toHaveBeenCalled();
    }
  });
});
