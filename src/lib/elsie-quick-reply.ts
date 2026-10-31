/** App facts only. Never reads records, dispatches work or claims screen access. */
import { namedRoomIdentity, roomIdentityForRoute } from "./office-room-identity";
import { synopsisListAnswer } from "./synopsis-context";
import type { LabelPositions } from "./office-map";

export function isPresenceCheck(text: string): boolean {
  if (/^elsie[?.!]*$/i.test(text.trim())) return true;
  const t = text.trim().replace(/^(?:elsie|okay|ok|hey)[,.!]?\s*/i, "");
  return /^(?:(?:are )?you (?:still )?there|(?:can|do) you hear me|anyone there|elsie)\s*[?.!]*$/i.test(
    t,
  );
}

/** Narrow whole-turn matches: compound requests always reach the normal tools. */
export function quickOfficeReply(
  request: string,
  route?: string,
  positions: LabelPositions | null = null,
): string | null {
  const t = request
    .trim()
    .replace(/^(?:elsie[,!]?\s+)?(?:please\s+)?/i, "")
    .replace(/[?.!]+$/, "")
    .trim();
  if (
    isPresenceCheck(request) ||
    /^(?:hi|hello|hey|good (?:morning|afternoon|evening))(?:[, ]+elsie)?$/i.test(t)
  )
    return "I'm here, John. What can I help you with?";
  if (
    /^(?:what|which) (?:office )?rooms (?:are there|do we have|are in (?:the|my|our) office|do you (?:know|know about))$/i.test(
      t,
    ) ||
    /^(?:do you know|what are) (?:all )?(?:the |my |our )?(?:office )?rooms$/i.test(t)
  )
    return synopsisListAnswer(positions);
  if (
    /^(?:(?:what|which) room (?:am I|are we|is this)(?: in)?|what is (?:the )?(?:current|open) room|where am I in (?:the|my) office)$/i.test(
      t,
    )
  ) {
    const room = roomIdentityForRoute(route);
    return room
      ? `The open Office page is ${room.shortLabel}. ${room.purpose} This identifies the page; I haven't read its saved records or inspected its picture.`
      : "I can't identify the current Office room from this page. Open a room from the Office map; I won't guess.";
  }
  const purpose =
    t.match(/^(?:what is|what's) (.+?) (?:for|used for|meant for)$/i) ??
    t.match(/^(?:what is the purpose of|what's the purpose of) (.+)$/i);
  if (purpose?.[1] && !/\b(?:and|then)\b|[;:\n]/i.test(purpose[1])) {
    const room = namedRoomIdentity(purpose[1]);
    if (room)
      return `${room.shortLabel}: ${room.purpose} That's the room's defined purpose; its current records and screen haven't been checked.`;
  }
  return null;
}
