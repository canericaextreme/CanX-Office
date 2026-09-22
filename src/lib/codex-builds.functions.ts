import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
export async function runCodexBuildOperation(token: string, request?: string, prNumber?: number) {
  const [{ verifyOwner }, { codexBuildsWith }] = await Promise.all([import('./canx-backend.server'), import('./codex-builds.server')]);
  return codexBuildsWith({ verify: verifyOwner, githubToken: process.env["CANX_CODEX_GITHUB_TOKEN"],
    enabled: process.env["CANX_CODEX_ENABLED"] === 'true', fetch: (url, init) => fetch(url, init) }, token, request, prNumber);
}
export const codexBuildOperation = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ accessToken: z.string(), request: z.string().min(10).max(6000).optional(), prNumber: z.number().int().positive().optional() }))
  .handler(async ({ data }) => runCodexBuildOperation(data.accessToken, data.request, data.prNumber));
