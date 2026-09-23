import { createServerFn } from "@tanstack/react-start";
import type { OwnerVerification } from "./canx-backend.server";
import type { Rest } from "./astra-continuity";

export interface VoiceTurnDeps {
  verifyOwner: (token: string) => Promise<OwnerVerification>;
  rest: (token: string) => Rest | null;
}

/** Saves one completed spoken turn for the server-verified owner. No AI call. */
export async function recordVoiceTurnWith(deps: VoiceTurnDeps, input: { accessToken: string; user: string; answer: string }) {
  const owner = await deps.verifyOwner(input.accessToken);
  if (!owner.ok) return { ok: false, message: owner.message };
  const rest = deps.rest(input.accessToken);
  if (!rest) return { ok: false, message: "No CanX database is configured." };
  const astra = await import("./astra-continuity");
  const result = await astra.recordAstraTurn(rest, owner.userId, input.user, input.answer);
  return result.saved
    ? { ok: true, message: "Spoken turn saved and read back." }
    : { ok: false, message: "The spoken turn was not saved to Astra memory." };
}

export const recordVoiceTurn = createServerFn({ method: "POST" })
  .inputValidator((raw: { accessToken?: unknown; user?: unknown; answer?: unknown }) => ({
    accessToken: typeof raw?.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "",
    user: typeof raw?.user === "string" ? raw.user.slice(0, 4000) : "",
    answer: typeof raw?.answer === "string" ? raw.answer.slice(0, 4000) : "",
  }))
  .handler(async ({ data }) => {
    const backend = await import("./canx-backend.server");
    const config = backend.readBackendConfig();
    return recordVoiceTurnWith({
      verifyOwner: token => backend.verifyOwnerWith(config, token),
      rest: token => config ? (path, init) => backend.restRequest(config, token, path, init) : null,
    }, data);
  });
