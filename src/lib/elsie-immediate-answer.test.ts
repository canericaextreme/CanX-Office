import { describe, expect, it, vi } from "vitest";
import { quickOfficeReply } from "./elsie-quick-reply";
import { OFFICE_ROOM_IDENTITIES } from "./office-room-identity";
import { runManagerChatWith, type ManagerDeps } from "./manager.functions";
import { synopsisListAnswer } from "./synopsis-context";

describe("Elsie's quick answers retain room identity without inventing observations", () => {
  it.each(["Elsie", "Hello", "Elsie, are you still there?", "Can you hear me?", "Good morning"])(
    "answers %s without needing office facts",
    (request) => {
      expect(quickOfficeReply(request, "/reception")).toContain("I'm here, John");
    },
  );
  it("uses the menu's actual order for room knowledge", () => {
    const positions = { "01": { x: 100, y: 30 } };
    expect(quickOfficeReply("What rooms do you know?", "/reception", positions)).toBe(
      synopsisListAnswer(positions),
    );
    expect(quickOfficeReply("What rooms do we have?")).toBe(synopsisListAnswer(null));
  });
  it.each(OFFICE_ROOM_IDENTITIES)("knows $route from the canonical directory", (room) => {
    expect(quickOfficeReply("What room am I in?", room.route)).toContain(room.shortLabel);
    expect(quickOfficeReply("What room am I in?", room.route)).toContain(room.purpose);
    expect(quickOfficeReply(`What is ${room.shortLabel} for?`)).toContain("haven't been checked");
  });
  it("does not turn an unknown page into Reception", () => {
    expect(quickOfficeReply("Which room is this?", "/not-a-room")).toContain("won't guess");
    expect(quickOfficeReply("Which room is this?", "/research?panel=open")).toContain("Research");
  });
  it.each([
    "Hello, build the new button",
    "Are you there? Continue the task.",
    "What rooms do you know and delete the old notes?",
    "What is in Finance?",
    "What do you see in this room?",
    "Open the Brain and read the latest note",
    "What is wrong with the Work Board?",
    "What is Finance for and archive the receipts?",
    "What are my approved tasks?",
    "Do you remember our last conversation?",
  ])("leaves facts, pictures, memory and actions on their existing path: %s", (request) => {
    expect(quickOfficeReply(request, "/finance")).toBeNull();
  });
});

describe("server fast answers", () => {
  const forbidden = () =>
    vi.fn(async () => {
      throw Error("unrelated work was started");
    });
  function fixture(owner = true) {
    const d = {
      verifyOwner: vi.fn(async () =>
        owner
          ? { ok: true, userId: "owner", email: "o@example.com", aal: "aal2" }
          : { ok: false, reason: "not_owner", message: "Denied" },
      ),
      buildContext: forbidden(),
      reserve: forbidden(),
      settle: forbidden(),
      fetchImpl: forbidden(),
      readContinuity: forbidden(),
      readRoomSnapshot: forbidden(),
      advanceBuilderQueue: forbidden(),
      recordTurn: forbidden(),
    };
    return d as unknown as ManagerDeps & typeof d;
  }
  it.each(["Are you there?", "Hello", "What rooms do we have?", "What room am I in?"])(
    "answers %s before queues, private records or a paid call",
    async (request) => {
      const d = fixture();
      const r = await runManagerChatWith(d, {
        accessToken: "token",
        currentRoute: "/research",
        voice: true,
        messages: [{ role: "user", content: request }],
      });
      expect(r).toMatchObject({ ok: true, provider: "none", toolCalls: [], actionResults: [] });
      expect(d.verifyOwner).toHaveBeenCalledOnce();
      for (const key of [
        "buildContext",
        "reserve",
        "fetchImpl",
        "readContinuity",
        "readRoomSnapshot",
        "advanceBuilderQueue",
        "recordTurn",
      ] as const)
        expect(d[key]).not.toHaveBeenCalled();
    },
  );
  it("still denies an unverified caller", async () => {
    const r = await runManagerChatWith(fixture(false), {
      accessToken: "bad",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(r).toMatchObject({ ok: false, code: "auth_not_ready" });
  });
});
