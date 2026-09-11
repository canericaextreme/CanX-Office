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
  const source = text.trim();
  // `full` is what gets read aloud if John asks for the rest, so it is spoken
  // text too — the written answer in the chat stays exactly as written.
  const full = forSpeech(source);
  if (!full) return { spoken: "", truncated: false, full };

  const bullets = listLines(source);
  if (bullets.length > MAX_LIST_ITEMS_SPOKEN) {
    const firstLine = source.split("\n")[0] ?? "";
    const lead = /^([-*•]|\d+[.)])\s+/.test(firstLine.trim()) ? "" : firstSentences(forSpeech(firstLine), 160);
    const head = bullets
      .slice(0, MAX_LIST_ITEMS_SPOKEN)
      .map((line) => forSpeech(line.replace(/^([-*•]|\d+[.)])\s+/, "")));
    const spoken = [
      lead,
      `There are ${bullets.length} items. The first ${MAX_LIST_ITEMS_SPOKEN} are: ${head.join("; ")}.`,
      "Want the rest?",
    ]
      .filter(Boolean)
      .join(" ");
    return { spoken, truncated: true, full };
  }

  const clean = full.replace(/\s+/g, " ").trim();
  if (clean.length > MAX_SPOKEN_CHARS) {
    const summary = firstSentences(clean, MAX_SPOKEN_CHARS);
    return {
      spoken: `${summary} That's the short version. Want the whole thing?`,
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

/* --------------------------- approval notices --------------------------- */

export interface SpokenActionResult {
  name: string;
  status: string;
  detail?: string;
}

/**
 * What the Manager says out loud right after it puts something in the approval
 * box. Only real pending results produce a sentence; nothing is invented.
 */
export function approvalSubmissionNotice(results: SpokenActionResult[] | undefined): string {
  const queued = (results ?? []).filter((r) => r.status === "pending");
  if (queued.length === 0) return "";
  const titles = queued
    .map((r) => /Queued for approval:\s*"([^"]+)"/.exec(r.detail ?? "")?.[1]?.trim())
    .filter((t): t is string => !!t);
  const lead =
    queued.length === 1
      ? titles[0]
        ? `That's a yellow one, so I've put it in the approval box: ${titles[0]}.`
        : "That's a yellow one, so I've put it in the approval box."
      : `That's ${queued.length} yellow items, so I've put them in the approval box.`;
  return `${lead} Nothing happens until you approve it. Say "open approvals" and I'll take you there.`;
}

/** What the Manager says when the pending-approval banner appears. */
export function pendingApprovalNotice(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  return count === 1
    ? "One item is waiting for your approval."
    : `${count} items are waiting for your approval.`;
}
