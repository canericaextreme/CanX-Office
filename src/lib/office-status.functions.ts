import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
/** Shared read entry for Elsie, Claude and ChatGPT adapters; no provider access granted. */
export const getOfficeStatus = createServerFn({ method: "POST" })
  .inputValidator(z.object({ accessToken: z.string().max(4000) }).strict())
  .handler(async ({ data }) => {
    const backend = await import("./canx-backend.server");
    const config = backend.readBackendConfig();
    if (!config) return { ok: false as const, message: backend.DENY_MESSAGES.backend_not_configured };
    const { readOfficeStatusWith } = await import("./office-status.server");
    return readOfficeStatusWith({
      verify: backend.verifySignedIn,
      read: path => backend.restRequest(config, data.accessToken, path, { method: "GET" }),
      configured: { anthropic: Boolean(process.env["ANTHROPIC_API_KEY"]?.trim()), github: Boolean(process.env["CANX_CODEX_GITHUB_TOKEN"]?.trim()) },
    }, data.accessToken);
  });
