import { createServerFn } from "@tanstack/react-start";
import type { MemoryHealth } from "./astra-continuity";

/** Owner-only memory health check. Makes no AI call and spends nothing. */
export const getAstraMemoryHealth = createServerFn({ method: "POST" })
  .inputValidator((raw: { accessToken?: unknown }) => ({
    accessToken: typeof raw?.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "",
  }))
  .handler(async ({ data }): Promise<MemoryHealth> => {
    const backend = await import("./canx-backend.server");
    const astra = await import("./astra-continuity");
    const config = backend.readBackendConfig();
    const checkedAt = new Date().toISOString();
    if (!config) return { state: "degraded", reason: "No CanX database is configured.", checkedAt };
    const owner = await backend.verifyOwnerWith(config, data.accessToken);
    if (!owner.ok) return { state: "degraded", reason: owner.message, checkedAt };
    return astra.checkAstraMemoryHealth((path, init) => backend.restRequest(config, data.accessToken, path, init), owner.userId);
  });
