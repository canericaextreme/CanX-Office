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
    return { ok: true, text: "I can only save or remove a mail rule for one exact sender address you name, for example “ignore future emails from news@example.com”. Nothing was changed." };
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
  const text = command.kind === "set"
    ? command.action === "ignore"
      ? `Saved: future emails from exactly ${command.sender} will be skipped by Check emails now (read back from the CanX account). Other senders are unaffected; a Keep choice on a single email still wins. Remove it any time in Subscriptions or by saying “stop ignoring ${command.sender}”.`
      : `Saved: future emails from exactly ${command.sender} will always be kept for review (read back from the CanX account).`
    : `Removed the rule for ${command.sender} (read back from the CanX account). Its emails go back to normal matching.`;
  return { ok: true, text };
}
