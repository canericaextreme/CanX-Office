/**
 * Elsie's typed and voice (submit_office_request -> managerChat) path for mail
 * rules. Deterministic: only John's explicit instruction naming an exact
 * address changes a rule; the model never creates one. Owner/MFA re-verified.
 */
import { preferencesSummary, type MailRuleCommand } from "./mail-preferences";
import { changePreferenceWith, readPreferencesWith, type MailPreferenceDeps } from "./mail-preferences.functions";

export async function runMailRuleCommandWith(
  deps: MailPreferenceDeps,
  token: string,
  command: MailRuleCommand,
): Promise<{ ok: boolean; text: string; authDenied?: boolean }> {
  if (command.kind === "needs-address") {
    return { ok: true, text: "Nothing was changed. I only save a sender rule from a plain command naming one exact address and nothing else — for example “ignore future emails from news@example.com”, “keep future emails from billing@example.com” or “stop ignoring news@example.com”. Requests with conditions (like “only promotions”), two addresses, quotes or questions aren’t saved. To skip just one email, use “Ignore this email” in Subscriptions → Saved mail review." };
  }
  if (command.kind === "list") {
    const read = await readPreferencesWith(deps, token);
    if (!read.ok || !read.data) return { ok: false, text: read.message, authDenied: true };
    return { ok: true, text: `${preferencesSummary(read.data)} You can change these in Subscriptions → Saved mail review.` };
  }
  const change = command.kind === "set"
    ? { op: "set-sender", sender: command.sender, action: command.action }
    : { op: "remove-sender", sender: command.sender };
  const saved = await changePreferenceWith(deps, token, change, "elsie-instruction");
  if (!saved.ok) return { ok: false, text: saved.message };
  const later = "This affects later email checks only. Older emails already skipped are not brought back automatically — ask for a fresh check if you want them looked at again.";
  const text = command.kind === "set"
    ? command.action === "ignore"
      ? `Saved: future emails from exactly ${command.sender} will be skipped by Check emails now (read back from the CanX account). Other senders are unaffected; a Keep choice on a single email still wins. Remove it any time in Subscriptions or by saying “stop ignoring ${command.sender}”.`
      : `Saved: when Check emails now looks for receipts and subscription emails, ones from exactly ${command.sender} won’t be skipped by an Ignore rule (read back from the CanX account). This only applies within that receipts and subscriptions check — it doesn’t cover your whole inbox. ${later}`
    : `Removed the rule for ${command.sender} (read back from the CanX account). Its emails go back to normal matching. ${later}`;
  return { ok: true, text };
}
