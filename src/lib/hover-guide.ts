/**
 * Hover guide words — the plain explanation shown when John points at anything in the Office.
 *
 * John, 12 Nov 2026: "each box in every office will show a description and purpose as you hover
 * over each" and "as i hover from item to item it should tell me an explanation of each".
 *
 * Three kinds of item get an explanation:
 *  - a room (its door on the map, a link to it, or its page title): the "house" picture from the
 *    12 Nov Office tour (/mnt/project-files/canx-office/office-tour/office-tour-20261112.md),
 *  - a box (card or shelf): its label from box-descriptions.ts, the same words Elsie uses,
 *  - a button or link inside a room: a written line for common buttons; any other button is
 *    explained by its own name plus the box it sits in (never invented).
 *
 * Pure: no storage, no network, no AI call.
 */
import { boxDescription } from "./box-descriptions";
import { cleanRoute, roomIdentityForRoute } from "./office-room-identity";

export interface HoverTip {
  kind: "room" | "box" | "button";
  title: string;
  what: string;
  why?: string;
  note?: string;
}

/** Each room as a room in a house (12 Nov Office tour wording). */
export const ROOM_TIPS: Record<string, { what: string; why: string }> = {
  "/reception": {
    what: "The front door of the Office.",
    why: "Start here every day: press Talk to Elsie, or pick a room.",
  },
  "/owner-desk": {
    what: "Your kitchen table in the morning.",
    why: "Today's priorities, emails, approvals, budget and recent changes in one place.",
  },
  "/approvals": {
    what: 'The "ask Dad first" basket.',
    why: "Each card says what someone wants to do, why, the cost and the risk. You approve or decline.",
  },
  "/work-board": {
    what: "The fridge to-do list.",
    why: "Every task with who has it, how important it is and whether it is done.",
  },
  "/brain": {
    what: "The family diary and photo album that every helper reads first.",
    why: "Everything worth remembering is written here so nobody forgets between visits.",
  },
  "/records": {
    what: "The filing cabinet for official papers and decisions.",
    why: "Keeps the evidence and history behind the Office's work.",
  },
  "/skills": {
    what: 'The rule book of "how we do things here".',
    why: "Shows what each room's helpers are allowed to do, and which how-tos are still missing.",
  },
  "/family-continuity": {
    what: 'The "if something happens to Dad" binder.',
    why: "So your kids can learn how the Office works and carry it on.",
  },
  "/finance": {
    what: "The piggy bank with a lock on it (it needs your two-step sign-in).",
    why: "Income, expenses, receipts, tax papers and the AI budget.",
  },
  "/subscriptions": {
    what: "The list of every monthly bill, like Netflix, but for AI and apps.",
    why: "Shows what you pay, when it renews, and cheaper options.",
  },
  "/legal": {
    what: 'The drawer for contracts, privacy and "are we allowed to?" questions.',
    why: "Keeps legal matters together and flags when a professional should look.",
  },
  "/idea-garage": {
    what: "The bike rack for new ideas.",
    why: "Ideas are parked and scored here before anyone spends money on them.",
  },
  "/research": {
    what: "The library.",
    why: "Holds evidence and source checks before a decision is made.",
  },
  "/projects": {
    what: "One shelf per project.",
    why: "Lists every project and app the Office is working toward.",
  },
  "/safe-highways": {
    what: "Your main business, in its own room.",
    why: "Safe Highways progress, its parts (public app, website, Foreman Hub) and routing evidence.",
  },
  "/build-testing": {
    what: "The workshop where code gets built and checked.",
    why: "The two robot builders, helper connections, viewing passes and the after-update check.",
  },
  "/blueprint": {
    what: "The house plans.",
    why: "How the Office is designed, and why.",
  },
  "/systems": {
    what: "The fuse box.",
    why: "What the Office is connected to, what is still needed, and the security checklist.",
  },
  "/health": {
    what: "The Office doctor's room.",
    why: "Meant for reliability and capacity checks. Its two boxes are planned and hold no data yet.",
  },
  "/analytics": {
    what: "The truck dashboard gauges.",
    why: "How the Office is doing. A number that isn't connected says so instead of showing zero.",
  },
  "/office-team": {
    what: "The staff photo wall.",
    why: "Who is real and working, and which AI helpers are only planned (grey).",
  },
  "/communications": {
    what: "The mailroom and the billboard team.",
    why: "Mailbox access and scheduled messages. Campaigns are not connected yet.",
  },
  "/round-table": {
    what: "The meeting table.",
    why: "Agenda, seats, notes, decisions and follow-up actions for a meeting.",
  },
  "/future": {
    what: 'An empty room with a "reserved" sign, on purpose.',
    why: "Space to grow the Office later, with no pretend staff and no spending.",
  },
  "/": {
    what: "The map of the whole Office house.",
    why: "Every room on one screen. Pick a room to walk in.",
  },
};

export function roomTip(route: string): HoverTip | null {
  const clean = route === "/" ? "/" : cleanRoute(route);
  if (!clean) return null;
  const words = ROOM_TIPS[clean];
  if (!words) return null;
  const title = clean === "/" ? "Office map" : (roomIdentityForRoute(clean)?.label ?? clean);
  return { kind: "room", title, what: words.what, why: words.why };
}

/** Common buttons, matched on the button's own words (case-insensitive). First match wins. */
export const BUTTON_TIPS: Array<[RegExp, string]> = [
  [/^talk to elsie/i, "Opens Elsie, the Office Manager. Tell her what you need by voice or text."],
  [
    /^edit list/i,
    "A list of every box in this room with the same controls, plus every change with Put back.",
  ],
  [
    /^edit( tab,)?\s*(locked|unlocked)$/i,
    "The Edit tab: Unlock to move or rename boxes, Edit for a list of every box, Lock when you're done.",
  ],
  [
    /^unlock/i,
    "Shows a small bar on every box so you can drag, move up or down, rename, or send it to another room.",
  ],
  [/^lock\b/i, "Hides the editing controls again. Your changes are already saved."],
  [/^put back/i, "Undoes this one change, putting the box back as it was."],
  [
    /^rename/i,
    "Gives this box a new name. Only the name shown changes; nothing inside is touched.",
  ],
  [/^move .* (up|down)$/i, "Moves this box one place up or down on its shelf."],
  [/^approve/i, "Says yes, so the work can go ahead."],
  [/^decline|^reject/i, "Says no, so the work does not go ahead."],
  [/^accept this email/i, "Keeps this email as Office work."],
  [
    /^ignore this email/i,
    "Skips this email and leaves this sender out of future sweeps. Gmail is not changed.",
  ],
  [
    /^(refresh|reload|check again|retry|try again)/i,
    "Reads the saved information again, in case something changed.",
  ],
  [/^show all|^show (fewer|less)/i, "Shows the whole list, or folds it back to the newest few."],
  [/^save\b/i, "Saves what you typed."],
  [/^cancel|^close|^dismiss/i, "Closes this without saving anything."],
  [/^open /i, "Opens it so you can read it."],
  [/^copy /i, "Copies it so you can paste it somewhere else."],
  [/^export/i, "Downloads a copy to your device."],
  [/^import/i, "Brings records in from a file."],
  [
    /^connect /i,
    "Starts connecting a service. Setup opens in a new tab and nothing is connected until you finish it.",
  ],
  [
    /^sign in|^open account/i,
    "Opens your sign-in. Some rooms need your two-step sign-in to show private information.",
  ],
  [/^back to previous/i, "Goes back to the screen you were on before."],
  [/^home \/ reception$/i, "Goes to the Office map, the front of the house."],
  [/^search rooms/i, "Type to find a room, task, project, worker or approval."],
  [/^room synopsis/i, "A short plain-words summary of every room, in tour order."],
  [/^stop\b/i, "Stops what is running now."],
  [/^send\b/i, "Sends it."],
];

export function buttonTip(
  label: string,
  boxId?: string | null,
  boxName?: string | null,
): HoverTip | null {
  const text = label.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!text) return null;
  for (const [pattern, what] of BUTTON_TIPS) {
    if (pattern.test(text)) {
      const note = boxId ? `In the "${boxName || boxId}" box.` : undefined;
      return { kind: "button", title: text, what, ...(note ? { note } : {}) };
    }
  }
  if (!boxId) return null;
  // Not a button we have words for: explain it by its own name and the box it belongs to.
  const box = boxDescription(boxId, boxName ?? "");
  return {
    kind: "button",
    title: text,
    what: `Does what its name says: "${text}".`,
    why: `It belongs to the "${boxName || boxId}" box: ${box.why}`,
  };
}

export function boxTip(
  id: string,
  name: string,
  renamed?: string | null,
  movedFrom?: string | null,
): HoverTip {
  const b = boxDescription(id, name);
  const notes = [
    renamed && renamed !== name ? `Built as "${name}".` : "",
    movedFrom ? `Moved here from ${roomIdentityForRoute(movedFrom)?.label ?? "another room"}.` : "",
  ].filter(Boolean);
  return {
    kind: "box",
    title: renamed || name,
    what: b.what,
    why: b.why,
    ...(notes.length ? { note: notes.join(" ") } : {}),
  };
}
