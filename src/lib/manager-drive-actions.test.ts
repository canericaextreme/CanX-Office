import { describe, expect, it, vi } from "vitest";

import { requestIsDiscussionOnly } from "./builder-choice";
import { requestExplicitlyAsksDriveWrite, requestNamesDriveFile } from "./drive-intent";
import { classifyManagerRisk } from "./manager-work.functions";
import { runManagerChatWith, sanitizeToolArgs, type ManagerDeps } from "./manager.functions";

describe("Drive action routing", () => {
  it("treats list/read/create/update as routine green work under existing policies", () => {
    for (const n of ["list_drive_files", "read_drive_file", "create_drive_file", "update_drive_file"]) expect(classifyManagerRisk(n, "drive")).toBe("green");
    expect(classifyManagerRisk("delete_data", "drive")).toBe("red");
  });

  it("treats examples and negations as discussion-only", () => {
    expect(requestIsDiscussionOnly("for example, could you create a drive file?")).toBe(true);
    expect(requestIsDiscussionOnly("don't create any drive files yet")).toBe(true);
  });

  it("requires an explicit Drive write in the current request", () => {
    expect(requestExplicitlyAsksDriveWrite("Save these meeting notes to my Drive")).toBe(true);
    expect(requestExplicitlyAsksDriveWrite("Update notes.txt in Google Drive")).toBe(true);
    expect(requestExplicitlyAsksDriveWrite("Create a task for the Finance review")).toBe(false);
    expect(requestExplicitlyAsksDriveWrite("What's on my Drive?")).toBe(false);
    expect(requestNamesDriveFile("update notes.txt in drive", "abc1234567890", "notes.txt")).toBe(true);
    expect(requestNamesDriveFile("update my drive file", "abc1234567890", "notes.txt")).toBe(false);
  });

  it("accepts Drive tool arguments (previously dropped as unknown tools)", () => {
    expect(sanitizeToolArgs("create_drive_file", JSON.stringify({ name: "a.txt", text: "hi", extra: 1 }))).toEqual({ name: "a.txt", text: "hi" });
    expect(sanitizeToolArgs("update_drive_file", JSON.stringify({ file_id: "abc1234567890", file_name: "a.txt", text: "x" }))).toEqual({ file_id: "abc1234567890", file_name: "a.txt", text: "x" });
    expect(sanitizeToolArgs("list_drive_files", "{}")).toEqual({});
  });
});

const tool = (name: string, input: unknown) => ({ type: "tool_use", id: "t1", name, input });
function setup(content: unknown[]) {
  const fetchImpl = vi.fn(async (url: unknown) =>
    String(url).includes("/v1/models/") ? Response.json({ id: "m" }) : Response.json({ stop_reason: "tool_use", content }),
  );
  const driveOp = vi.fn(async () => ({ ok: true as const, detail: "Created." }));
  const deps: ManagerDeps = {
    provider: "anthropic", anthropicKey: "k", openaiKey: "o", model: "m",
    verifyOwner: async () => ({ ok: true, userId: "owner", email: "o@example.test", aal: "aal2" }),
    buildContext: async () => ({ ok: true, text: "RECORDS" }),
    reserve: vi.fn().mockResolvedValue({ allowed: true, reservationId: "r", remainingToday: 10 }),
    settle: vi.fn().mockResolvedValue(undefined),
    fetchImpl: fetchImpl as typeof fetch,
    driveOp,
  };
  return { deps, driveOp };
}
const say = (content: string) => ({ accessToken: "owner-token", messages: [{ role: "user" as const, content }], currentRoute: "/systems", buildId: "b" });

describe("shared executor blocks unrequested Drive writes", () => {
  it("blocks a provider-proposed create from an unrelated actionable request", async () => {
    const h = setup([tool("create_drive_file", { name: "x.txt", text: "x" })]);
    const reply = await runManagerChatWith(h.deps, say("Create a task to review the Finance receipts"));
    expect(h.driveOp).not.toHaveBeenCalled();
    expect(JSON.stringify(reply)).toContain("did not explicitly ask");
  });

  it("blocks an update that does not name the exact file", async () => {
    const h = setup([tool("update_drive_file", { file_id: "abc1234567890", file_name: "budget.txt", text: "x" })]);
    await runManagerChatWith(h.deps, say("Update my notes file in Drive"));
    expect(h.driveOp).not.toHaveBeenCalled();
  });

  it("runs an explicitly requested create once", async () => {
    const h = setup([tool("create_drive_file", { name: "notes.txt", text: "hello" })]);
    await runManagerChatWith(h.deps, say("Save a file called notes.txt to my Drive saying hello"));
    expect(h.driveOp).toHaveBeenCalledExactlyOnceWith("create", expect.objectContaining({ name: "notes.txt", text: "hello" }));
  });

  it("passes the exact intended file name for a named update", async () => {
    const h = setup([tool("update_drive_file", { file_id: "abc1234567890", file_name: "notes.txt", text: "new" })]);
    await runManagerChatWith(h.deps, say("Update notes.txt in my Drive to say new"));
    expect(h.driveOp).toHaveBeenCalledExactlyOnceWith("update", expect.objectContaining({ fileId: "abc1234567890", fileName: "notes.txt" }));
  });
});
