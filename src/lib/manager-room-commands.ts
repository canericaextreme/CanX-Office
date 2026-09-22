import { ROOMS, roomByRoute, type RoomDef } from "./office-data";

const normalize = (text: string) => text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export function namedOfficeRoom(text: string): RoomDef | null {
  const words = ` ${normalize(text)} `;
  const candidates = ROOMS.flatMap(room => [room.shortLabel, room.id, ...room.label.split(" / "),
    ...(room.id === "subscriptions" ? ["subscription", "subscription watch"] : []),
    ...(room.id === "product-studio" ? ["studio", "product build room"] : []),
    ...(room.id === "brain" ? ["brain"] : []),
  ].map(alias => ({ room, alias: normalize(alias) })))
    .filter(({ alias }) => words.includes(` ${alias} `)).sort((a, b) => b.alias.length - a.alias.length);
  return candidates[0]?.room ?? null;
}

export type RoomCommand =
  | { kind: "look"; room: RoomDef }
  | { kind: "report"; room: RoomDef; content: string }
  | { kind: "text-size"; size: number }
  | { kind: "move-panel"; side: "left" | "right" };

/** Direct requests only. Quoted examples, negation and hypothetical requests do not execute. */
export function parseRoomCommand(request: string, currentPath: string): RoomCommand | null {
  if (/\b(don['’]?t|do not|never|hypothetical|example|if|would|could you explain|how)\b/i.test(request)) return null;
  const text = request.trim().replace(/^(?:data[, ]+)?(?:please\s+)?/i, "");
  const move = text.match(/^(?:move|put) (?:the |your )?(?:data |office manager |manager )?(?:window|panel) (?:to |on )?(?:the )?(left|right)(?: side)?[.!]?$/i);
  if (move) return { kind: "move-panel", side: move[1] as "left" | "right" };
  if (/^make (?:the |your )?(?:conversation )?(?:text|font) (?:larger|bigger)[.!]?$/i.test(text)) return { kind: "text-size", size: 28 };
  if (/^make (?:the |your )?(?:conversation )?(?:text|font) smaller[.!]?$/i.test(text)) return { kind: "text-size", size: 20 };
  const size = text.match(/^(?:set|change|make) (?:the |your )?(?:conversation |text |font )?(?:text |font )?size (?:to )?(20|24|28|32)(?:\s*(?:px|pixels))?[.!]?$/i);
  if (size) return { kind: "text-size", size: Number(size[1]) };
  // The colon / "saying" separates the destination from the owner's report text.
  const report = text.match(/^(?:add|save|put) (?:a |this )?(?:report|note) (?:to|in|into) (.+?)(?::|\s+saying\s+)([\s\S]+)$/i);
  if (report?.[1] && report[2]) {
    const room = namedOfficeRoom(report[1]) ?? (/^(?:the )?(?:current|this) room$/i.test(report[1].trim()) ? roomByRoute(currentPath) : null);
    if (room && report[2].trim()) return { kind: "report", room, content: report[2].trim() };
    return null;
  }
  if (!/^(?:(?:can|could|will) you )?(?:look|see|check|inspect|review|show|open|go|take a look|tell me what you see|tell me what(?: is|s|’s|\'s) in|what(?: is|s|’s|\'s) in|what do you see)\b/i.test(text)) return null;
  const room = namedOfficeRoom(text) ?? (/\b(this|current|open) (room|page|screen)\b|^what do you see|^tell me what you see/i.test(text) ? roomByRoute(currentPath) : null);
  return room ? { kind: "look", room } : null;
}

export const roomReportSource = (roomId: string) => `Data room report: ${roomId}`;
