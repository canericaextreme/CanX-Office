/**
 * Free Claude key check for Elsie's pre-trip (3 Nov 2026).
 *
 * Why: the Office only learned about the Claude key's expiry from Anthropic's
 * warning emails. When John renewed the key, no email came, so the Office kept
 * believing the old "expires 3 Nov" note. This check asks Anthropic "is this
 * key accepted?" every pre-trip, so a renewal (or an expiry) shows up by itself.
 *
 * Cost: none. It only lists models (GET /v1/models), which uses no AI tokens and
 * takes no budget reservation. The key is never returned, logged or saved; the
 * result only says accepted / refused / could not check.
 *
 * Two copies of the key are checked, because the Office keeps it in two places:
 * - "office": the server setting ANTHROPIC_API_KEY that Elsie, the pre-trip
 *   message test and the colleague relay use (Lovable project secrets).
 * - "vault": the Supabase Vault copy that the Claude build panel uses, checked
 *   through the existing owner-only claude-chat function (action "models").
 * The GitHub Actions copy (builder and merge reviewer) cannot be seen from here.
 */
import type { PreTripCheck } from "./pretrip";

export const KEY_CHECK_TIMEOUT_MS = 10_000;
export type KeyCopy = "office" | "vault";
export interface KeyCheck { copy: KeyCopy; result: "accepted" | "refused" | "missing" | "unknown"; httpStatus: number | null; note: string }

export const KEY_LABELS: Record<KeyCopy, string> = {
  office: "Claude key used by Elsie (free check)",
  vault: "Claude key used by the build panel (free check)",
};

/** Asks Anthropic whether the Office server's own key is accepted. */
export async function checkOfficeAnthropicKey(fetchImpl: typeof fetch, key: string | undefined): Promise<KeyCheck> {
  if (!key?.trim()) return { copy: "office", result: "missing", httpStatus: null, note: "No Claude key is set on the Office server." };
  try {
    const res = await fetchImpl("https://api.anthropic.com/v1/models?limit=1", {
      method: "GET", redirect: "manual", signal: AbortSignal.timeout(KEY_CHECK_TIMEOUT_MS),
      headers: { "x-api-key": key.trim(), "anthropic-version": "2023-06-01" },
    });
    if (res.ok) return { copy: "office", result: "accepted", httpStatus: res.status, note: "Anthropic accepted the key." };
    if (res.status === 401 || res.status === 403) return { copy: "office", result: "refused", httpStatus: res.status, note: "Anthropic refused the key (expired, deleted or wrong)." };
    return { copy: "office", result: "unknown", httpStatus: res.status, note: `Anthropic answered HTTP ${res.status}, so the key could not be judged.` };
  } catch {
    return { copy: "office", result: "unknown", httpStatus: null, note: "Anthropic could not be reached." };
  }
}

/** Asks the existing claude-chat function to check the Vault copy (owner + two-step sign-in required). */
export async function checkVaultAnthropicKey(fetchImpl: typeof fetch, backendUrl: string, publishableKey: string, accessToken: string): Promise<KeyCheck> {
  try {
    const res = await fetchImpl(`${backendUrl}/functions/v1/claude-chat`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(KEY_CHECK_TIMEOUT_MS),
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "models" }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: unknown; code?: unknown } | null;
    if (res.ok && body?.ok === true) return { copy: "vault", result: "accepted", httpStatus: res.status, note: "Anthropic accepted the Vault key." };
    if (body?.code === "provider_unavailable") return { copy: "vault", result: "refused", httpStatus: res.status, note: "Anthropic refused the Vault key (expired, deleted or wrong) or was unreachable." };
    if (body?.code === "vault_unavailable") return { copy: "vault", result: "missing", httpStatus: res.status, note: "No Claude key could be read from Vault." };
    if (res.status === 401) return { copy: "vault", result: "unknown", httpStatus: res.status, note: "Needs John's two-step sign-in to check." };
    return { copy: "vault", result: "unknown", httpStatus: res.status, note: `The check answered HTTP ${res.status}.` };
  } catch {
    return { copy: "vault", result: "unknown", httpStatus: null, note: "The Vault check could not be reached." };
  }
}

/** Turns a key check into a pre-trip row. Refused = red, missing = red for Elsie's key, yellow for the panel. */
export function keyCheckRow(k: KeyCheck): PreTripCheck {
  const status: PreTripCheck["status"] = k.result === "accepted" ? "green"
    : k.result === "refused" ? "red"
    : k.result === "missing" ? (k.copy === "office" ? "red" : "yellow")
    : "unverified";
  const tail = k.result === "accepted"
    ? " Works today; the Office cannot see the expiry date, so this is re-checked every pre-trip. No AI tokens used."
    : k.result === "refused" ? " John: make a new key in the Anthropic console and paste it into this copy's setting. No AI tokens used."
    : " No AI tokens used.";
  return { id: `key:claude-${k.copy}`, area: "AI team", label: KEY_LABELS[k.copy], status, detail: `${k.note}${tail}`.slice(0, 300) };
}
