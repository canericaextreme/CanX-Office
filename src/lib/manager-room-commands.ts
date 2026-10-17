import { namedRoomIdentity, roomIdentityForRoute, type OfficeRoomIdentity } from "./office-room-identity";
import { parseRoomNavigation, type RoomNavigationCommand } from "./room-navigation";

export const namedOfficeRoom = namedRoomIdentity;
type RoomDef = OfficeRoomIdentity;

export type RoomCommand =
  | { kind: "look"; room: RoomDef; question?: string }
  | { kind: "report"; room: RoomDef; content: string }
  | { kind: "text-size"; size: number }
  | { kind: "move-panel"; side: "left" | "right" }
  // Display only: move this screen to a room. Separate from "look", which reads it.
  | RoomNavigationCommand;

/** Direct requests only. Quoted examples, negation and hypothetical requests do not execute. */
/**
 * Drops spoken lead-ins before the command: the manager's name (also as the
 * transcriber mishears it, e.g. "Kirby," on 17 Oct), "okay", "so", "please".
 * A leading room name is kept, so "Finance, ..." never loses its room.
 */
function withoutLeadIn(request: string): string {
  let text = request.trim();
  for (let i = 0; i < 4; i++) {
    const filler = text.match(/^(?:okay|ok|so|now|hey|alright|all right|right|yeah|well|um|uh|please)\b[,.!]?\s*/i);
    const name = text.match(/^(?:(?:elsie|astra|data)\b[,.!]?\s*|([a-z][a-z'’]{1,14})[,!]\s+)/i);
    if (filler?.[0]) text = text.slice(filler[0].length);
    else if (name?.[0] && !(name[1] && namedOfficeRoom(name[1]))) text = text.slice(name[0].length);
    else break;
  }
  return text;
}

export function parseRoomCommand(request: string, currentPath: string): RoomCommand | null {
  if (/\b(don['’]?t|do not|never|hypothetical|example|if|would|could you explain)\b/i.test(request)) return null;
  const text = withoutLeadIn(request);
  const navigation = parseRoomNavigation(text);
  if (navigation) return navigation;
  // Visual follow-ups inspect the room open NOW, rather than answering from
  // an older screenshot or the general room description. They never write.
  const visualQuestion = (/^(?:how many|count)\b/i.test(text) && /\b(?:cards?|folders?|papers?|shelves|items?|blue|red|yellow|gold|white|gr[ae]y|green|black|visible)\b/i.test(text))
    || /^(?:what|which) colou?rs?\b/i.test(text)
    || /^walk me through\b/i.test(text)
    || /^(?:what|is|are|can you|how can we|check|tell me)\b.*\b(?:visibly|visible|broken|wrong|faults?|confusing|interactive|proactive)\b/i.test(text);
  if (visualQuestion) {
    const room = namedOfficeRoom(text) ?? roomIdentityForRoute(currentPath);
    return room ? { kind: "look", room, question: text } : null;
  }
  if (/^how\b/i.test(text)) return null;
  const move = text.match(/^(?:move|put) (?:the |your )?(?:elsie |astra |data |office manager |manager )?(?:window|panel) (?:to |on )?(?:the )?(left|right)(?: side)?[.!]?$/i);
  if (move) return { kind: "move-panel", side: move[1] as "left" | "right" };
  if (/^make (?:the |your )?(?:conversation )?(?:text|font) (?:larger|bigger)[.!]?$/i.test(text)) return { kind: "text-size", size: 28 };
  if (/^make (?:the |your )?(?:conversation )?(?:text|font) smaller[.!]?$/i.test(text)) return { kind: "text-size", size: 20 };
  const size = text.match(/^(?:set|change|make) (?:the |your )?(?:conversation |text |font )?(?:text |font )?size (?:to )?(20|24|28|32)(?:\s*(?:px|pixels))?[.!]?$/i);
  if (size) return { kind: "text-size", size: Number(size[1]) };
  // The colon / "saying" separates the destination from the owner's report text.
  const report = text.match(/^(?:add|save|put) (?:a |this )?(?:report|note) (?:to|in|into) (.+?)(?::|\s+saying\s+)([\s\S]+)$/i);
  if (report?.[1] && report[2]) {
    const room = namedOfficeRoom(report[1]) ?? (/^(?:the )?(?:current|this) room$/i.test(report[1].trim()) ? roomIdentityForRoute(currentPath) : null);
    if (room && report[2].trim()) return { kind: "report", room, content: report[2].trim() };
    return null;
  }
  if (!/^(?:(?:can|could|will) you )?(?:look|see|check|inspect|review|show|open|go|take a look|tell me what you see|tell me what(?: is|s|’s|\'s) in|what(?: is|s|’s|\'s) in|what do you see)\b/i.test(text)) return null;
  const room = namedOfficeRoom(text) ?? (/\b(this|current|open) (room|page|screen)\b|^what do you see|^tell me what you see/i.test(text) ? roomIdentityForRoute(currentPath) : null);
  return room ? { kind: "look", room } : null;
}

export const roomReportSource = (roomId: string) => `Data room report: ${roomId}`;
