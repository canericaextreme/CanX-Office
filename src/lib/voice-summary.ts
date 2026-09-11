/**
 * Spoken-answer shaping for Voice Mode.
 *
 * The Manager speaks a short summary by default and asks before reading a long
 * list or a long answer aloud. Nothing here changes the written answer: the
 * full text always stays visible in the chat.
 */

const MAX_SPOKEN_CHARS = 320;
const MAX_LIST_ITEMS_SPOKEN = 3;

export interface SpokenAnswer {
  /** What the browser should say now. */
  spoken: string;
  /** True when more of the answer was held back. */
  truncated: boolean;
  /** Full text to read if John says yes. */
  full: string;
}

function listLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^([-*•]|\d+[.)])\s+/.test(line));
}

function firstSentences(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]*/g) ?? [clean];
  let out = "";
  for (const sentence of sentences) {
    if ((out + sentence).length > limit) break;
    out += sentence;
  }
  if (!out.trim()) out = clean.slice(0, limit);
  return out.trim();
}

/** Build the short spoken version of an answer. */
/**
 * Turn written text into something that sounds like a person saying it.
 *
 * Only the spoken words change: markdown marks are dropped rather than read
 * out, and money, dates and shorthand are said the way John would say them.
 * The written answer in the chat is never altered.
 */
export function forSpeech(text: string): string {
  let out = text;
  out = out.replace(/```[\s\S]*?```/g, " a code block ");
  out = out.replace(/^#{1,6}\s+/gm, "");
  out = out.replace(/^\s*([-*•]|\d+[.)])\s+/gm, "");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
  out = out.replace(/`([^`]+)`/g, "$1");
  out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  out = out.replace(/https?:\/\/\S+/g, "a link");
  // Money and shorthand, said aloud.
  out = out.replace(/C\$\s?([\d,]+(?:\.\d{1,2})?)/g, (_m, n: string) => `${n.replace(/,/g, "")} Canadian dollars`);
  out = out.replace(/\$\s?([\d,]+(?:\.\d{1,2})?)/g, (_m, n: string) => `${n.replace(/,/g, "")} dollars`);
  out = out.replace(/(\d+)\.00\b/g, "$1");
  out = out.replace(/\be\.g\./gi, "for example").replace(/\bi\.e\./gi, "that is");
  out = out.replace(/\bASAP\b/g, "as soon as possible");
  out = out.replace(/\s*[—–]\s*/g, ", ");
  out = out.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n");
  return out.trim();
}

export function spokenSummary(text: string): SpokenAnswer {
  const full = forSpeech(text).trim();
  if (!full) return { spoken: "", truncated: false, full };

  const bullets = listLines(full);
  if (bullets.length > MAX_LIST_ITEMS_SPOKEN) {
    const lead = firstSentences(full.split("\n")[0] ?? "", 160);
    const head = bullets.slice(0, MAX_LIST_ITEMS_SPOKEN).map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, ""));
    const spoken = [
      lead && !/^([-*•]|\d+[.)])\s+/.test(lead) ? lead : "",
      `There are ${bullets.length} items. The first ${MAX_LIST_ITEMS_SPOKEN} are: ${head.join("; ")}.`,
      "Would you like me to read the full list?",
    ]
      .filter(Boolean)
      .join(" ");
    return { spoken, truncated: true, full };
  }

  const clean = full.replace(/\s+/g, " ").trim();
  if (clean.length > MAX_SPOKEN_CHARS) {
    const summary = firstSentences(clean, MAX_SPOKEN_CHARS);
    return {
      spoken: `${summary} That is the short version. Would you like me to read the whole answer?`,
      truncated: true,
      full,
    };
  }

  return { spoken: clean, truncated: false, full };
}

const YES = /^(yes|yeah|yep|yup|sure|ok(ay)?|please|go ahead|read it|read them|read the (full )?(list|answer)|all of it|continue|carry on)\b/i;
const NO = /^(no|nope|nah|not now|skip|stop|that'?s (fine|enough)|never mind)\b/i;

/** Is this reply a plain yes to "shall I read the rest?" */
export function isAffirmative(text: string): boolean {
  return YES.test(text.trim().replace(/^[,.\s]+/, ""));
}

/** Is this reply a plain no? */
export function isNegative(text: string): boolean {
  return NO.test(text.trim().replace(/^[,.\s]+/, ""));
}
