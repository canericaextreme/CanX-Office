import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
export const claudeBuildOperation = createServerFn({ method: 'POST' })
 .inputValidator(z.object({accessToken:z.string().max(4000), request:z.string().min(10).max(6000).optional(), runId:z.number().int().positive().optional()}))
 .handler(async ({data}) => {
  const [{verifyOwner},{claudeBuildsWith,CLAUDE_BUILD_MAX_USD}] = await Promise.all([import('./canx-backend.server'),import('./claude-builds.server')]);
  return claudeBuildsWith({verify:verifyOwner, githubToken:process.env['CANX_CODEX_GITHUB_TOKEN']?.trim(), enabled:process.env['CANX_CODEX_ENABLED']==='true' && process.env['CANX_CLAUDE_ENABLED']!=='false', maxBudgetUsd:CLAUDE_BUILD_MAX_USD, fetch:(input,init)=>fetch(input,init)},data.accessToken,data.request,undefined,data.runId);
 });
