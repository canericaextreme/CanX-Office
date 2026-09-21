import { describe, it, expect, vi } from "vitest";
import { ConversationSaveQueue } from "./conversation-save-queue";
const a = { id: "a", role: "user" as const, content: "hello" };
const b = { id: "b", role: "assistant" as const, content: "hi" };
describe("conversation save recovery", () => {
  it("retains failed turns in order and retries with the new token", async () => {
    const q = new ConversationSaveQueue(); const report = vi.fn();
    let token = "expired";
    const save = vi.fn(async () => ({ ok: token === "fresh", message: "Sign in again" }));
    q.add(a); q.add(b); await q.flush(save, report);
    expect(q.size).toBe(2); expect(save).toHaveBeenCalledOnce();
    token = "fresh"; await q.flush(save, report);
    expect(save.mock.calls).toHaveLength(3); expect(q.size).toBe(0);
    expect(report).toHaveBeenLastCalledWith("Conversation saved.");
  });
  it("serializes saves and does not resend a successful turn", async () => {
    const q = new ConversationSaveQueue(); const save = vi.fn(async (_message: typeof a | typeof b) => ({ ok: true, message: "Saved" }));
    q.add(a); const first = q.flush(save, vi.fn()); q.add(b);
    await Promise.all([first, q.flush(save, vi.fn())]);
    await q.flush(save, vi.fn());
    expect(save.mock.calls.map(call => call[0])).toEqual([a,b]);
  });
  it("keeps thrown saves pending and stops stale writes after account changes", async () => {
    const q = new ConversationSaveQueue(); q.add(a);
    await q.flush(async () => { throw Error("offline"); }, vi.fn()); expect(q.size).toBe(1);
    let resolve!: (r: {ok: boolean; message: string}) => void;
    const save = vi.fn(() => new Promise<{ok: boolean; message: string}>(r => { resolve = r; }));
    const report = vi.fn(); q.add(b); const run = q.flush(save, report);
    q.clear(); resolve({ok:true,message:"Saved"}); await run;
    expect(save).toHaveBeenCalledOnce(); expect(report).not.toHaveBeenCalled(); expect(q.size).toBe(0);
  });
});
