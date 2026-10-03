/**
 * Owner-only mail Keep/Ignore preferences. Every call re-verifies the owner
 * (session, owner role, two-step verification) on the server. No Gmail access.
 */
import { createServerFn } from "@tanstack/react-start";
import { parsePreferenceChange, type MailPreferences, type PreferenceChange, type PreferenceSource } from "./mail-preferences";
import type { OwnerVerification } from "./canx-backend.server";

export interface MailPreferencesResult {
  ok: boolean;
  message: string;
  data: MailPreferences | null;
}

export interface MailPreferenceDeps {
  verifyOwner: (token: string) => Promise<OwnerVerification>;
  read: (token: string) => Promise<MailPreferences | null>;
  change: (token: string, ownerId: string, change: PreferenceChange, by: PreferenceSource) => Promise<{ ok: boolean; preferences?: MailPreferences }>;
}

async function realDeps(): Promise<MailPreferenceDeps> {
  const backend = await import("./canx-backend.server");
  const store = await import("./subscriptions-store.server");
  return {
    verifyOwner: backend.verifyOwner,
    read: store.readMailPreferences,
    change: store.changeMailPreference,
  };
}

export async function readPreferencesWith(deps: MailPreferenceDeps, token: string): Promise<MailPreferencesResult> {
  const owner = await deps.verifyOwner(token);
  if (!owner.ok) return { ok: false, message: owner.message, data: null };
  const prefs = await deps.read(token);
  return prefs ? { ok: true, message: "", data: prefs } : { ok: false, message: "Mail preferences could not be read.", data: null };
}

export async function changePreferenceWith(deps: MailPreferenceDeps, token: string, raw: unknown, by: PreferenceSource): Promise<MailPreferencesResult> {
  const change = parsePreferenceChange(raw);
  if (!change) return { ok: false, message: "That choice was not in the expected shape, so nothing was changed.", data: null };
  const owner = await deps.verifyOwner(token);
  if (!owner.ok) return { ok: false, message: owner.message, data: null };
  const saved = await deps.change(token, owner.userId, change, by).catch(() => ({ ok: false }));
  if (!saved.ok || !("preferences" in saved) || !saved.preferences) {
    return { ok: false, message: "The choice could not be saved and read back, so it is not in effect. Nothing else was changed.", data: null };
  }
  return { ok: true, message: "Saved to the CanX account and read back.", data: saved.preferences };
}

const token = (input: unknown) => {
  const raw = input as { accessToken?: unknown } | undefined;
  return typeof raw?.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "";
};

export const getMailPreferences = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ({ accessToken: token(input) }))
  .handler(async ({ data }) => readPreferencesWith(await realDeps(), data.accessToken));

export const setMailPreference = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ({ accessToken: token(input), change: (input as { change?: unknown })?.change }))
  .handler(async ({ data }) => changePreferenceWith(await realDeps(), data.accessToken, data.change, "owner-ui"));

export async function realMailPreferenceDeps() {
  return realDeps();
}
