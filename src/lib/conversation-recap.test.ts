import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isRecallRequest, recapFromMessages, type RecapMessage } from "./conversation-recap";

// John's spoken turns from the saved records, 17 Oct 16:20-16:23 UTC.
const SAVED: RecapMessage[] = [
  { role: "user", content: "What are we going to start running this morning?", at: "2026-10-17T14:05:00Z" },
  { role: "assistant", content: "The first three queued prompts are Brain organization and task memory.", at: "2026-10-17T14:05:04Z" },
  { role: "office", content: "Summary saved." },
  { role: "user", content: "Do you see any weak spots in the office? What do we need to work on today?", at: "2026-10-17T16:20:39Z" },
  { role: "assistant", content: "The real weak spots are Elsie's continuity and the work queue.", at: "2026-10-17T16:20:39Z" },
  { role: "user", content: "Can you get on my same time, or are you always gonna default back to your time?", at: "2026-10-17T16:21:31Z" },
  { role: "assistant", content: "Yes. I'll use your Whitehorse time when I speak with you.", at: "2026-10-17T16:21:31Z" },
  { role: "user", content: "Are you there?", at: "2026-10-17T16:21:46Z" },
  { role: "assistant", content: "I'm here.", at: "2026-10-17T16:21:46Z" },
];

describe("recalling the conversation from the saved turns", () => {
  it("recognises John's recall questions and leaves other questions alone", () => {
    for (const q of ["Tell me what we were just talking about a couple of minutes ago.", "I asked you, what did we talk about a few minutes ago?", "What did we just talk about?", "Repeat our last conversation.", "What was our last conversation?"])
      expect(isRecallRequest(q)).toBe(true);
    for (const q of ["What are we going to start running this morning?", "Read the synopsis list.", "Don't repeat our last conversation."]) expect(isRecallRequest(q)).toBe(false);
  });

  it("reads back the newest exchanges in order, in Whitehorse time, without the question being asked", () => {
    const ask = "What did we just talk about?";
    const text = recapFromMessages([...SAVED, { role: "user", content: ask }], ask, 3);
    const lines = text.split("\n");
    expect(lines[0]).toBe("From the saved conversation, here are our last 3 exchanges, oldest first:");
    expect(lines[1]).toBe('At 9:20 a.m., you said: "Do you see any weak spots in the office? What do we need to work on today?" I answered: "The real weak spots are Elsie\'s continuity and the work queue."');
    expect(lines[3]).toContain('"Are you there?"');
    expect(text).not.toContain("this morning");
    expect(text).not.toContain(ask);
  });

  it("skips earlier recall exchanges and never invents a conversation", () => {
    const withRecall = [...SAVED, { role: "user" as const, content: "What did we just talk about?" }, { role: "assistant" as const, content: "From the saved conversation..." }];
    expect(recapFromMessages(withRecall, "Repeat our last conversation.", 1)).toContain('"Are you there?"');
    expect(recapFromMessages([], "What did we just talk about?")).toMatch(/no saved conversation.*Nothing was guessed/);
  });

  it("answers before any paid Office call, for typed and spoken requests", () => {
    const manager = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
    const recall = manager.indexOf("isRecallRequest(request)");
    expect(recall).toBeGreaterThan(-1);
    expect(recall).toBeLessThan(manager.indexOf("const command = parseRoomCommand(request"));
    expect(manager).toContain("recapFromMessages(messagesRef.current, request)");
  });
});
