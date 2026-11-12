// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  EXPLAIN_REQUEST,
  OFFICE_HOW_IT_WORKS,
  roomGuideForModel,
  sanitizeScreen,
  screenForModel,
} from "./room-guide";
import { collectScreenSnapshot } from "./room-screen";
import { parseRoomCommand } from "./manager-room-commands";
import { validate } from "./manager.functions";

const NOW = Date.parse("2026-11-12T02:00:00Z");
const fresh = new Date(NOW - 30_000).toISOString();

function page(html: string): Document {
  const doc = document.implementation.createHTMLDocument("t");
  doc.body.innerHTML = html;
  return doc;
}

describe("Elsie's room guide: what John's screen shows", () => {
  it("reads the outer boxes on the open page in screen order, with renames and moved boxes", () => {
    const doc = page(`
      <div data-room-box="finance.receipts" data-room-box-name="Receipts" data-room-box-home="/finance"><h2>Receipts</h2> 44 receipts filed</div>
      <div data-room-box="finance.totals" data-room-box-name="Monthly totals" data-room-box-home="/finance" data-room-box-renamed="Money this month">
        <div data-room-box="finance.inner" data-room-box-name="Inner" data-room-box-home="/finance">nested</div>
      </div>
      <div data-room-box="legal.matters" data-room-box-name="Legal matters" data-room-box-home="/legal" class="canx-room-box canx-room-box-editing">Contracts</div>
      <div hidden data-canx-borrowed-room="/legal"><div data-room-box="legal.hidden" data-room-box-name="Hidden" data-room-box-home="/legal">x</div></div>`);
    const s = collectScreenSnapshot("/finance", doc, new Date(NOW))!;
    expect(s.route).toBe("/finance");
    expect(s.editing).toBe(true);
    expect(s.boxes.map((b) => b.id)).toEqual([
      "finance.receipts",
      "finance.totals",
      "legal.matters",
    ]);
    expect(s.boxes[0]).toMatchObject({
      name: "Receipts",
      excerpt: expect.stringContaining("44 receipts filed"),
    });
    expect(s.boxes[1]).toMatchObject({ renamed: "Money this month" });
    expect(s.boxes[2]).toMatchObject({ movedFrom: "/legal" });
    expect(s.boxes[0]!.movedFrom).toBeUndefined();
  });

  it("treats the home page as Reception, so Reception boxes are not called moved", () => {
    const doc = page(
      `<div data-room-box="reception.start" data-room-box-name="Start" data-room-box-home="/reception">Hi</div>`,
    );
    const s = collectScreenSnapshot("/", doc, new Date(NOW))!;
    expect(s.route).toBe("/reception");
    expect(s.boxes[0]!.movedFrom).toBeUndefined();
  });

  it("keeps a screen only when it is fresh and for the room John has open", () => {
    const good = {
      route: "/finance",
      collectedAt: fresh,
      editing: false,
      boxes: [{ id: "finance.receipts", name: "Receipts", excerpt: "44" }],
    };
    expect(sanitizeScreen(good, "/finance", NOW)?.boxes).toHaveLength(1);
    expect(sanitizeScreen(good, "/legal", NOW)).toBeNull();
    expect(
      sanitizeScreen(
        { ...good, collectedAt: new Date(NOW - 10 * 60_000).toISOString() },
        "/finance",
        NOW,
      ),
    ).toBeNull();
    expect(sanitizeScreen({ ...good, boxes: "nope" }, "/finance", NOW)).toBeNull();
    expect(sanitizeScreen(good, undefined, NOW)).toBeNull();
  });

  it("drops malformed boxes, caps text and removes control characters", () => {
    const s = sanitizeScreen(
      {
        route: "/finance",
        collectedAt: fresh,
        boxes: [
          { id: "not an id", name: "x" },
          {
            id: "finance.a",
            name: "A\u0000B",
            excerpt: "y".repeat(1000),
            movedFrom: "https://evil.test",
          },
          { id: "finance.a", name: "dup" },
        ],
      },
      "/finance",
      NOW,
    )!;
    expect(s.boxes).toHaveLength(1);
    expect(s.boxes[0]!.name).toBe("A B");
    expect(s.boxes[0]!.excerpt.length).toBe(240);
    expect(s.boxes[0]!.movedFrom).toBeUndefined();
  });

  it("validate keeps the screen only for the open room", () => {
    const screen = {
      route: "/finance",
      collectedAt: new Date().toISOString(),
      boxes: [{ id: "finance.receipts", name: "Receipts", excerpt: "" }],
    };
    expect(
      validate({ accessToken: "t", messages: [], currentRoute: "/finance", screen }).screen?.boxes,
    ).toHaveLength(1);
    expect(
      validate({ accessToken: "t", messages: [], currentRoute: "/legal", screen }).screen,
    ).toBeUndefined();
  });
});

describe("Elsie's room guide: what goes to Elsie", () => {
  const screen = sanitizeScreen(
    {
      route: "/finance",
      collectedAt: fresh,
      editing: false,
      boxes: [
        { id: "finance.receipts", name: "Receipts", excerpt: "44 receipts filed" },
        {
          id: "finance.totals",
          name: "Monthly totals",
          renamed: "Money this month",
          excerpt: "C$",
        },
        { id: "legal.matters", name: "Legal matters", movedFrom: "/legal", excerpt: "Contracts" },
      ],
    },
    "/finance",
    NOW,
  );

  it("short version on ordinary requests: purpose and box names, no box words, no Office guide", () => {
    const text = roomGuideForModel({
      latestUser: "add a task to pay the phone bill",
      currentRoute: "/finance",
      screen,
      positions: null,
    });
    expect(text).toContain("Purpose:");
    expect(text).toContain('"Receipts"');
    expect(text).toContain('"Money this month" (John\'s name; built as "Monthly totals")');
    expect(text).toContain("moved here by John from Legal");
    expect(text).not.toContain("44 receipts filed");
    expect(text).not.toContain(OFFICE_HOW_IT_WORKS);
  });

  it("full version when John asks Elsie to explain or walk through", () => {
    for (const ask of [
      "walk me through this room",
      "explain this room",
      "what does this box do?",
      "how does the Edit tab work?",
      "what am I looking at",
    ]) {
      expect(EXPLAIN_REQUEST.test(ask)).toBe(true);
      const text = roomGuideForModel({
        latestUser: ask,
        currentRoute: "/finance",
        screen,
        positions: null,
      });
      expect(text).toContain('shows: "44 receipts filed"');
      expect(text).toContain("Where its information comes from:");
      expect(text).toContain(OFFICE_HOW_IT_WORKS);
      expect(text).toContain("UNTRUSTED DATA");
    }
  });

  it("says plainly when the screen could not be seen, and adds nothing outside a room", () => {
    expect(screenForModel(null, "/finance", true)).toContain("NOT available");
    expect(
      roomGuideForModel({
        latestUser: "explain",
        currentRoute: undefined,
        screen: null,
        positions: null,
      }),
    ).toBe("");
  });
});

describe("Explain questions skip the paid picture review", () => {
  it("answers 'walk me through' and 'what's in this room' from the guide, not a screenshot", () => {
    expect(parseRoomCommand("Elsie, walk me through this room", "/finance")).toBeNull();
    expect(parseRoomCommand("what's in this room?", "/finance")).toBeNull();
    expect(parseRoomCommand("explain the Finance room", "/legal")).toBeNull();
    expect(parseRoomCommand("tell me about Finance", "/legal")).toBeNull();
  });

  it("opens a different named room first, then answers there", () => {
    expect(parseRoomCommand("walk me through the Finance room", "/legal")).toMatchObject({
      kind: "open-read",
      room: { route: "/finance" },
    });
    expect(parseRoomCommand("what's in the Legal room?", "/finance")).toMatchObject({
      kind: "open-read",
      room: { route: "/legal" },
    });
  });

  it("still uses the picture review when John asks Elsie to look", () => {
    expect(parseRoomCommand("look at this room", "/finance")?.kind).toBe("look");
    expect(parseRoomCommand("what do you see", "/finance")?.kind).toBe("look");
    expect(parseRoomCommand("what colours are the cards?", "/finance")?.kind).toBe("look");
  });
});
