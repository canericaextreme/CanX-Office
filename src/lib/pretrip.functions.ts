import { createServerFn } from "@tanstack/react-start";
import type { PreTripRecord, PreTripTrigger } from "./pretrip";
import type { PreTripDeps } from "./pretrip.server";

export type PreTripReply =
  | { ok: true; record: PreTripRecord | null; saved?: boolean; repeated?: boolean; detail: string }
  | { ok: false; code: "auth" | "not_configured" | "failed"; message: string };

const env = (k: string) => process.env[k]?.trim() || undefined;

/** Server wiring shared by the button, the daily start and Elsie's run_pretrip tool. Keys stay on the server. */
export async function preTripServerDeps(token: string, ownerId: string, aal: string, buildId = "unknown"): Promise<PreTripDeps | null> {
  const backend = await import("./canx-backend.server");
  const config = backend.readBackendConfig();
  if (!config) return null;
  const { readRoomSnapshotWith } = await import("./room-snapshot.server");
  const { pingColleague } = await import("./pretrip-colleague");
  const pingDeps = {
    fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)) as typeof fetch,
    openaiKey: env("OPENAI_API_KEY"), openaiModel: env("OPENAI_TEXT_MODEL") ?? env("OPENAI_MODEL"),
    anthropicKey: env("ANTHROPIC_API_KEY"), anthropicModel: env("ANTHROPIC_MODEL"),
    reserve: async (cents: number) => {
      const r = await backend.reserveAiCallWith(config, token, cents);
      return r.allowed ? { allowed: true as const, reservationId: r.reservationId } : { allowed: false as const, message: r.message };
    },
    settle: (id: string, outcome: "ok" | "failed") => backend.settleAiCallWith(config, token, id, outcome),
  };
  return {
    rest: (path, init) => backend.restRequest(config, token, path, init),
    readRoom: (target) => readRoomSnapshotWith({ config, token, aal, target, buildId, device: null, rest: backend.restRequest }),
    ping: (c, code, title) => pingColleague(pingDeps, c, code, title),
    ownerId, aal,
  };
}

/** Latest saved pre-trip for the card. Read-only; no AI call. */
export const readPreTrip = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = (input ?? {}) as { accessToken?: unknown };
    return { accessToken: typeof raw.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "" };
  })
  .handler(async ({ data }): Promise<PreTripReply> => {
    const backend = await import("./canx-backend.server");
    const config = backend.readBackendConfig();
    if (!config) return { ok: false, code: "not_configured", message: backend.DENY_MESSAGES.backend_not_configured };
    const v = await backend.verifySignedInWith(config, data.accessToken);
    if (!v.ok) return { ok: false, code: "auth", message: v.message };
    const { readLatestPreTrip } = await import("./pretrip.server");
    const r = await readLatestPreTrip((p, i) => backend.restRequest(config, data.accessToken, p, i), v.userId);
    return r.ok ? { ok: true, record: r.record, detail: r.record ? "Read from the Brain." : "No pre-trip has been saved yet." } : { ok: false, code: "failed", message: "Saved pre-trip records could not be read." };
  });

/** Runs the inspection (daily: at most once per Office-local day; manual: a fresh record). */
export const runPreTrip = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = (input ?? {}) as { accessToken?: unknown; trigger?: unknown; buildId?: unknown };
    return {
      accessToken: typeof raw.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "",
      trigger: (raw.trigger === "manual" ? "manual" : "daily") as PreTripTrigger,
      buildId: typeof raw.buildId === "string" ? raw.buildId.slice(0, 80) : "unknown",
    };
  })
  .handler(async ({ data }): Promise<PreTripReply> => {
    const backend = await import("./canx-backend.server");
    const config = backend.readBackendConfig();
    if (!config) return { ok: false, code: "not_configured", message: backend.DENY_MESSAGES.backend_not_configured };
    const v = await backend.verifySignedInWith(config, data.accessToken);
    if (!v.ok) return { ok: false, code: "auth", message: v.message };
    const deps = await preTripServerDeps(data.accessToken, v.userId, v.aal, data.buildId);
    if (!deps) return { ok: false, code: "not_configured", message: backend.DENY_MESSAGES.backend_not_configured };
    const { runPreTripWith } = await import("./pretrip.server");
    const r = await runPreTripWith(deps, data.trigger);
    return r.ok ? { ok: true, record: r.record, saved: r.saved, repeated: r.repeated, detail: r.detail } : { ok: false, code: "failed", message: r.detail };
  });
