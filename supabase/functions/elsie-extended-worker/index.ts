// Candidate only. Not part of automatic deployment; activation needs owner review.
// Bundle src/lib/elsie-worker-edge.server.ts as worker.js before deploying.
// @ts-ignore Generated bundled module (see docs/elsie-phase-four-activation.md).
import { createPersistentWorkerHandler } from './worker.js';
Deno.serve(createPersistentWorkerHandler({
 enabled:Deno.env.get('ELSIE_WORKER_ENABLED')==='true',
 projectUrl:Deno.env.get('SUPABASE_URL')??'',
 publishableKey:Deno.env.get('SUPABASE_ANON_KEY')??'',
 scopedWorkerJwt:Deno.env.get('ELSIE_WORKER_DB_JWT')??'',
 pollToken:Deno.env.get('ELSIE_WORKER_TOKEN')??'',
 githubToken:Deno.env.get('CANX_CODEX_GITHUB_TOKEN')??'',
}));
