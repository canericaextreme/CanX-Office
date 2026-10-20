/** Scheduled, bounded worker tick. Durable decisions come from transactional RPCs.
 * Never authenticates as the owner, retries dispatch, or merges/publishes candidates.
 */
import { officeBuildProtectedCategory, looksLikeOfficeCodeChange } from './codex-task-handoff';
export const WORKER_REPO = 'canericaextreme/CanX-Office';
const workflow = { codex: 'canx-codex.yml', claude: 'canx-claude.yml' } as const;
type Builder = keyof typeof workflow;
export interface WorkerTransport {
 rpc: (name: string, args: Record<string, unknown>) => Promise<unknown>;
 github: (path: string, init?: RequestInit) => Promise<Response>;
 enabled: boolean;
}
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const builder = (v: unknown): v is Builder => v === 'codex' || v === 'claude';
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v)>0;
export type WorkerResult = { state: 'disabled'|'blocked'|'waiting'|'submitted'|'uncertain'|'reconciled'; reason: string; jobId?: string };

export async function runPersistentWorkerTick(deps: WorkerTransport): Promise<WorkerResult[]> {
 if (deps.enabled !== true) return [{state:'disabled',reason:'Worker disabled'}];
 const results: WorkerResult[] = [];
 // Reconcile first, even for an expired/stopped grant: receipts are read-only
 // provider operations, not permission to dispatch another task.
 const pending = await deps.rpc('elsie_worker_pending',{});
 if (!Array.isArray(pending) || pending.length>2) return [{state:'blocked',reason:'Unreadable pending receipts'}];
 for (const raw of pending) {
  const p=object(raw);
  if (!uuid(p['jobId']) || !builder(p['builder'])) return [{state:'blocked',reason:'Invalid pending receipt'}];
  if (p['state'] !== 'submitted' || !positive(p['runId'])) {
   results.push({state:'uncertain',reason:'Committed attempt has no confirmed run. Never redispatch.',jobId:p['jobId']});
   continue;
  }
  const response=await deps.github(`/actions/runs/${p['runId']}`);
  if (!response.ok) return [...results,{state:'blocked',reason:'Run reconciliation unavailable'}];
  const run=object(await response.json());
  if (run['id']!==p['runId'] || run['path']!==`.github/workflows/${workflow[p['builder']]}` || run['event']!=='workflow_dispatch'
   || object(run['repository'])['full_name']!==WORKER_REPO || run['head_branch']!=='main')
   return [...results,{state:'blocked',reason:'Run identity mismatch'}];
  if (run['status']!=='completed') { results.push({state:'waiting',reason:'Recorded build remains active',jobId:p['jobId']}); continue; }
  const outcome=run['conclusion'];
  if (typeof outcome!=='string' || !['success','failure','cancelled','timed_out','action_required','startup_failure','stale','skipped'].includes(outcome))
   return [...results,{state:'blocked',reason:'Unknown terminal outcome'}];
  await deps.rpc('elsie_worker_reconcile',{_job:p['jobId'],_run:p['runId'],_outcome:outcome});
  results.push({state:'reconciled',reason:`Build ${outcome}; release remains gated`,jobId:p['jobId']});
 }
 for (const b of ['codex','claude'] as const) {
  const claim=object(await deps.rpc('elsie_worker_claim',{_builder:b}));
  if (claim['state']!=='leased') {
   results.push({state:claim['state']==='waiting'?'waiting':'blocked',reason:typeof claim['reason']==='string'?claim['reason']:'Claim unavailable'});
   continue;
  }
  const jobId=claim['jobId'], leaseId=claim['leaseId'], request=claim['request'], cost=claim['upperBoundCents'];
  if (!uuid(jobId)||!uuid(leaseId)||claim['builder']!==b||typeof request!=='string'||request.length<10||request.length>6000
   || !positive(cost)||!looksLikeOfficeCodeChange(request)||officeBuildProtectedCategory(request))
   return [...results,{state:'blocked',reason:'Invalid or protected claim; no dispatch'}];
  // Claude's existing runner enforces its supplied USD ceiling. Codex has no
  // enforced per-run cost ceiling today: do not turn a reservation into a guess.
  if (b==='codex') return [...results,{state:'blocked',reason:'Codex enforced cost ceiling unavailable',jobId}];
  if (cost<10 || cost>1000) return [...results,{state:'blocked',reason:'Claude upper bound outside enforced range',jobId}];
  // Check all live builder runs; never infer idle from only the latest page.
  let idle=true;
  for (let page=1;page<=10;page++) {
   const response=await deps.github(`/actions/workflows/${workflow[b]}/runs?per_page=100&page=${page}`);
   if (!response.ok) return [...results,{state:'blocked',reason:'Builder availability unavailable',jobId}];
   const runs=object(await response.json())['workflow_runs'];
   if (!Array.isArray(runs)) return [...results,{state:'blocked',reason:'Builder run list invalid',jobId}];
   if (runs.some(r=>object(r)['status']!=='completed')) {idle=false;break;}
   if (runs.length<100) break;
   if (page===10) return [...results,{state:'blocked',reason:'Builder history incomplete',jobId}];
  }
  if (!idle) {results.push({state:'waiting',reason:'Builder already active',jobId});continue;}
  // The DB rechecks revocation, expiry, version and lease, then persists the
  // attempted state BEFORE the single irreversible outbound submission.
  if (await deps.rpc('elsie_worker_begin',{_job:jobId,_lease:leaseId})!==true) {
   results.push({state:'blocked',reason:'Dispatch admission revoked',jobId});continue;
  }
  let runId:number|null=null;
  try {
   const sent=await deps.github(`/actions/workflows/${workflow[b]}/dispatches`,{method:'POST',body:JSON.stringify({ref:'main',inputs:{request,max_budget_usd:String(cost/100)}})});
   if (sent.ok) {const body=object(await sent.json());if(positive(body['workflow_run_id'])) runId=body['workflow_run_id'];}
  } catch { /* A timeout or empty accepted response is uncertain, never retried. */ }
  await deps.rpc('elsie_worker_receipt',{_job:jobId,_run:runId});
  results.push({state:runId===null?'uncertain':'submitted',reason:runId===null?'Dispatch uncertain. Reservation and builder slot retained.':'Exact run recorded; candidate is not live',jobId});
 }
 return results;
}
