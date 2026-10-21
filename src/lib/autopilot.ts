/**
 * The Office autopilot switch (21 Oct 2026). John: "the build persistently
 * moves forward till I say stop, or there's money to be spent, or there's a
 * legal issue."
 *
 * One Brain note, office_notes `office-autopilot`, line 1:
 *   `AUTOPILOT: on|stopped | UPDATED: <iso> | BY: <who> | NOTE: <short text>`
 * Elsie flips it when John says "stop everything" / "resume work"; the hourly
 * Claude worker and Elsie's queue read it before starting anything on their own.
 * No note means on. A stop only halts work that would start by itself: a new
 * request John makes is still his OK for that one job.
 * Pure: no network, no storage.
 */

export type AutopilotMode = "on" | "stopped";
export const AUTOPILOT_NOTE_ID = "office-autopilot";

export interface AutopilotState { mode: AutopilotMode; updated?: string; by?: string; note?: string }

const field = (line: string, name: string) => new RegExp(`(?:^|\\|)\\s*${name}:\\s*([^|\\n]+)`, "i").exec(line)?.[1]?.trim();

/** Reads line 1 of the switch note. A missing or unreadable note counts as on. */
export function parseAutopilot(detail: string | null | undefined): AutopilotState {
  const line = (detail ?? "").split("\n")[0] ?? "";
  const raw = field(line, "AUTOPILOT")?.toLowerCase();
  const updated = field(line, "UPDATED");
  const by = field(line, "BY");
  const note = field(line, "NOTE");
  return {
    mode: raw === "stopped" ? "stopped" : "on",
    ...(updated ? { updated: updated.slice(0, 40) } : {}),
    ...(by ? { by: by.slice(0, 40) } : {}),
    ...(note ? { note: note.slice(0, 200) } : {}),
  };
}

export function autopilotDetail(mode: AutopilotMode, at: string, by: string, words: string): string {
  const said = words.replace(/[|\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return [
    `AUTOPILOT: ${mode} | UPDATED: ${at} | BY: ${by} | NOTE: John said "${said}"`,
    "on = Elsie's queue and the hourly Claude worker keep building, merging and publishing routine Office changes.",
    "stopped = nothing starts on its own until John says resume. Money, security, sign-in, database and legal changes always wait for John either way.",
  ].join("\n");
}

const LEAD = String.raw`^(?:(?:ok(?:ay)?|yeah|yes|so|alright|all right|right|now|hey|elsie)[,.!]?\s+)*(?:please\s+)?`;
const STOP = new RegExp(String.raw`${LEAD}(?:stop|pause|halt|freeze)\s+(?:all|every|everything|the autopilot|autopilot|building|the builds|all (?:the )?(?:work|builds|jobs))\b|\b(?:stop everything|stop all (?:the )?(?:work|builds|jobs)|turn (?:off|stop) (?:the )?autopilot|autopilot (?:off|stop))\b`, "i");
const RESUME = new RegExp(String.raw`${LEAD}(?:resume|restart|unpause)\s+(?:all\s+)?(?:the\s+)?(?:work|builds|building|autopilot|everything|jobs)\b|\b(?:turn (?:the )?autopilot (?:back )?on|turn on (?:the )?autopilot|autopilot (?:on|resume)|start (?:building|work(?:ing)?) again|keep building again)\b`, "i");

/** John's turn as a switch command, or null. Questions and "don't stop" never flip it. */
export function autopilotCommand(request: string): AutopilotMode | null {
  const text = request.trim();
  if (!text || /\?\s*$/.test(text)) return null;
  if (/\b(?:don['’]?t|do not|never|no need to)\s+(?:stop|pause|halt)\b/i.test(text)) return null;
  const stop = STOP.test(text);
  const resume = RESUME.test(text);
  if (stop === resume) return null;
  return stop ? "stopped" : "on";
}

/** Legal matters are John's call, like money: the builders and the Claude worker never take them on alone. */
const LEGAL = /\b(?:legal(?:ly)?|lawyer|attorney|lawsuit|court|contracts?|licen[cs]e agreement|terms (?:of service|and conditions)|privacy policy|liabilit(?:y|ies)|regulator|regulatory|compliance|trademark|copyright|patent|indemnit(?:y|ies)|nda)\b/i;
/** The Office's own Legal room is a place, not a legal matter: "recolour the Legal room heading" is a screen edit. */
export const touchesLegal = (text: string): boolean => LEGAL.test(text.replace(/\blegal (?:room|page|tab|desk)\b|\/legal\b/gi, " "));
