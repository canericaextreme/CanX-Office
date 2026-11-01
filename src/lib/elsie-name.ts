/**
 * The speech transcriber often hears "Elsie" as "LC" (28 Oct: "LC name the
 * saved office connection inventory", "our LC repair work"), and once as
 * "Kirby," (17 Oct). Every command check in the Office looks for "Elsie", so
 * a misheard name made real requests fall through. Fix the name once, where
 * John's words come in, so every later check sees "Elsie".
 */

// Vocabulary hint for the transcriber. Plain words only: no instructions.
export const ELSIE_TRANSCRIPTION_PROMPT =
  "John is talking to Elsie, the manager of the CanX Office. Words he uses: Elsie, CanX, CanX Office, CanX Brain, Work Board, Reception, Owner's Desk, Approvals, Finance, Research, Safe Highways, Codex, Claude, ChatGPT, Lovable, pre-trip.";

const LEAD_IN = String.raw`^(\s*(?:(?:ok(?:ay)?|hey|so|now|yeah|yes|alright|all right|well)[,.!]?\s+)*)`;
// At the start of a turn, these can only be John calling her name.
const MISHEARD_AT_START = new RegExp(`${LEAD_IN}(?:l\\.?\\s?c\\.?|kirby(?=[,!]))(?=[\\s,.!?:]|$)`, "i");
// Anywhere: spellings that are never another real word, and capital "LC" / "L.C.".
const MISSPELLED_ANYWHERE = /\b(?:elsy|elsey|elsi|elcy|elsee)\b/gi;
const CAPITAL_LC = /(?<![\w.])L\.?C\.?(?=[\s,!?:'’]|\.?$|\.\s)/g;

export function fixElsieName(text: string): string {
  if (!text) return text;
  return text
    .replace(MISHEARD_AT_START, (_match, lead: string) => `${lead}Elsie`)
    .replace(MISSPELLED_ANYWHERE, "Elsie")
    .replace(CAPITAL_LC, "Elsie");
}
