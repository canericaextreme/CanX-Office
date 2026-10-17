/**
 * "What did we just talk about?" answered from the saved conversation itself,
 * never from a model's paraphrase. On 17 Oct the reasoner blended an older
 * morning thread into the recap and invented a "you told me to stop".
 * Pure: the caller passes the conversation it already holds.
 */
export interface RecapMessage { role: "user" | "assistant" | "office"; content: string; at?: string | undefined }

const RECALL_REQUEST = /\b(?:what (?:(?:did|were|have) we|we (?:were|have been|had been)) (?:just |been )?(?:talk(?:ed|ing)? about|discuss(?:ed|ing)?|chat(?:ted|ting)? about|say|said|cover(?:ed)?)|what (?:was|were) (?:our|the) (?:last |previous )?(?:conversation|discussion|talk)|repeat (?:our|the|what we) (?:last |previous )?(?:conversation|discussion|talk|said)|(?:remind|tell) me what we (?:just )?(?:talked about|discussed|said))\b/i;

export function isRecallRequest(text: string): boolean {
  const t = text.trim();
  return !!t && !/\b(?:don['’]?t|do not|never)\b/i.test(t) && RECALL_REQUEST.test(t);
}

const short = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};
const clock = (at: string | undefined, timeZone: string) => {
  const d = at ? new Date(at) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString("en-CA", { timeZone, hour: "numeric", minute: "2-digit" }) : "time not saved";
};

/** The last few saved exchanges before this question, oldest first, with times. */
export function recapFromMessages(messages: RecapMessage[], request: string, pairs = 4, timeZone = "America/Whitehorse"): string {
  const turns = messages.filter((m) => m.role !== "office" && m.content.trim());
  // Drop the question being asked now, and earlier recall exchanges, so the recap is about the real talk.
  const last = turns[turns.length - 1];
  if (last?.role === "user" && last.content.trim() === request.trim()) turns.pop();
  const exchanges: { user: RecapMessage; answer?: RecapMessage }[] = [];
  for (let i = 0; i < turns.length; i++) {
    const m = turns[i]!;
    if (m.role !== "user") continue;
    const next = turns[i + 1];
    exchanges.push(next?.role === "assistant" ? { user: m, answer: next } : { user: m });
  }
  const real = exchanges.filter((e) => !isRecallRequest(e.user.content)).slice(-pairs);
  if (!real.length) return "I have no saved conversation before this question, so there is nothing to repeat. Nothing was guessed.";
  return [
    `From the saved conversation, here are our last ${real.length === 1 ? "exchange" : `${real.length} exchanges`}, oldest first:`,
    ...real.map((e) => `At ${clock(e.user.at, timeZone)}, you said: "${short(e.user.content, 220)}"${e.answer ? ` I answered: "${short(e.answer.content, 260)}"` : " I had not answered yet."}`),
    "Ask me to go further back or to continue any of these.",
  ].join("\n");
}
