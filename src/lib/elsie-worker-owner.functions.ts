import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import type {OwnerVerification} from './canx-backend.server';
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('status'),accessToken:z.string().max(4000)}),
 z.object({action:z.literal('enroll'),accessToken:z.string().max(4000),expires:z.string().datetime(),maxCents:z.number().int().min(0).max(10000),tasks:z.array(z.string().uuid()).min(1).max(6)}),
 z.object({action:z.literal('stop'),accessToken:z.string().max(4000),sessionId:z.string().uuid()}),
]);
export type OwnerWorkerInput=z.infer<typeof input>;
export const workerStatusSchema=z.object({
 sessions:z.array(z.object({id:z.string().uuid(),expires_at:z.string(),stopped_at:z.string().nullable(),max_cents:z.number().int()})),
 eligible:z.array(z.object({id:z.string().uuid(),title:z.string(),worker:z.string()})),
});
export type WorkerOwnerStatus=z.infer<typeof workerStatusSchema>;
interface OwnerWorkerDeps {
 verify:(token:string)=>Promise<OwnerVerification>;
 rpc:(token:string,name:string,args:Record<string,unknown>)=>Promise<{ok:boolean;body:unknown}>;
 now:()=>number;
}
export async function workerOwnerActionWith(deps:OwnerWorkerDeps,raw:unknown):Promise<{ok:boolean;detail:string;status?:WorkerOwnerStatus;sessionId?:string}> {
 const data=input.parse(raw), owner=await deps.verify(data.accessToken);
 if(!owner.ok || owner.aal!=='aal2')return {ok:false,detail:'Owner authenticator verification required'};
 if(data.action==='enroll'&&(Date.parse(data.expires)<=deps.now()||Date.parse(data.expires)>deps.now()+10*3600_000||new Set(data.tasks).size!==data.tasks.length))
  return {ok:false,detail:'Choose distinct tasks and an expiration within ten hours'};
 const name=data.action==='status'?'elsie_worker_status':data.action==='stop'?'elsie_worker_stop':'elsie_worker_enroll';
 const args=data.action==='status'?{}:data.action==='stop'?{_session:data.sessionId}:{_expires:data.expires,_max_cents:data.maxCents,_tasks:data.tasks};
 const response=await deps.rpc(data.accessToken,name,args);
 if(!response.ok)return {ok:false,detail:'Worker controls unavailable. The reviewed backend may not be installed. No action was confirmed.'};
 if(data.action==='status'){
  const parsed=workerStatusSchema.safeParse(response.body);
  return parsed.success?{ok:true,detail:'Saved worker controls read',status:parsed.data}:{ok:false,detail:'Worker status could not be verified'};
 }
 if(data.action==='enroll')return z.string().uuid().safeParse(response.body).success?{ok:true,detail:'Scoped enrollment recorded. This does not enable the scheduler or prove execution.',sessionId:response.body as string}:{ok:false,detail:'Enrollment receipt uncertain. Refresh status before attempting again.'};
 return {ok:true,detail:'Owner stop recorded. No further dispatch can begin under this enrollment; existing provider work may still finish.'};
}
export const ownerWorkerAction=createServerFn({method:'POST'}).inputValidator((value:unknown)=>input.parse(value)).handler(async({data})=>{
 const backend=await import('./canx-backend.server');const config=backend.readBackendConfig();
 return workerOwnerActionWith({verify:t=>backend.verifyOwnerWith(config,t),now:()=>Date.now(),rpc:async(t,n,args)=>{
  if(!config)return {ok:false,body:null};return backend.restRequest(config,t,`rpc/${n}`,{method:'POST',body:JSON.stringify(args)});
 }},data);
});
