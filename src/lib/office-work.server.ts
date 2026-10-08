/** Delegated build entry point. Uses the same builder implementations as Elsie. */
import { z } from 'zod';
import { directBuildRefusal, builderChoiceFor } from './builder-choice';
import { codexBuildsWith } from './codex-builds.server';
import { claudeBuildsWith, CLAUDE_BUILD_MAX_USD } from './claude-builds.server';
import type { OwnerVerification } from './canx-backend.server';
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('submit'),requestId:z.string().uuid(),request:z.string().min(10).max(6000)}).strict(),
 z.object({action:z.literal('status'),builder:z.enum(['codex','claude']),runId:z.number().int().positive().optional(),prNumber:z.number().int().positive().optional()}).strict(),
]);
export interface OfficeWorkBuildDeps {
 verify:(token:string)=>Promise<OwnerVerification>;
 rpc:(token:string,name:string,args:Record<string,unknown>)=>Promise<unknown>;
 build:(builder:'codex'|'claude',token:string,request?:string,prNumber?:number,runId?:number)=>Promise<unknown>;
}
export async function officeWorkBuildWith(deps:OfficeWorkBuildDeps,token:string,value:unknown):Promise<unknown>{
 const parsed=input.safeParse(value);if(!parsed.success)throw Error('Invalid work request');
 if(!(await deps.verify(token)).ok)throw Error('Current working permission required');
 const data=parsed.data;
 if(data.action==='status')return deps.build(data.builder,token,undefined,data.prNumber,data.runId);
 const choice=builderChoiceFor(data.request);if('conflict' in choice)return {ok:false,detail:'Choose one builder; nothing submitted.'};
 const refusal=directBuildRefusal(data.request,choice.builder);if(refusal)return {ok:false,detail:refusal};
 const claim=await deps.rpc(token,'canx_mcp_claim_build',{_request_id:data.requestId,_builder:choice.builder,_request:data.request}) as {dispatch?:boolean;result?:unknown};
 if(claim.dispatch!==true)return claim.result??{ok:false,detail:'This request was already attempted. Check existing builds; nothing was resubmitted.'};
 let result:unknown;
 try{result=await deps.build(choice.builder,token,data.request);}catch{result={ok:false,detail:'Submission is uncertain. Check existing builds; this request will not be resubmitted.'};}
 await deps.rpc(token,'canx_mcp_finish_build',{_request_id:data.requestId,_result:result});
 return result;
}
export async function liveOfficeWorkBuild(token:string,value:unknown){
 const backend=await import('./canx-backend.server');
 const {checkOfficeMcpAuthorization}=await import('./office-mcp-auth');
 const config=backend.readBackendConfig();if(!config)throw Error('CANX_BACKEND_NOT_CONFIGURED');
 const boundFetch:typeof fetch=(url,init)=>fetch(url,init);
 const rpc=async(t:string,name:string,args:Record<string,unknown>)=>{
  const r=await backend.restRequest(config,t,`rpc/${name}`,{method:'POST',body:JSON.stringify(args)},boundFetch);
  if(!r.ok)throw Error('CANX_WORK_RPC_UNAVAILABLE');return r.body;
 };
 const verify=async(t:string):Promise<OwnerVerification>=>{
  const authorization=await checkOfficeMcpAuthorization(config,t,boundFetch);
  if(!authorization.ok)throw Error(authorization.code);
  if(await rpc(t,'canx_mcp_work_active',{})!==true)throw Error('CANX_WORK_GRANT_REQUIRED');
  // Decode only after signature + live owner/session/client/grant verification.
  const claims=backend.decodeClaims(t);
  if(!claims || typeof claims['sub']!=='string')throw Error('CANX_CLAIMS_INVALID');
  return {ok:true,userId:claims['sub'],email:'',aal:typeof claims['aal']==='string'?claims['aal']:'aal1'};
 };
 return officeWorkBuildWith({verify,rpc,build:(builder,t,request,prNumber,runId)=>{
  const common={verify,githubToken:process.env['CANX_CODEX_GITHUB_TOKEN']?.trim(),fetch:boundFetch};
  return builder==='claude'?claudeBuildsWith({...common,enabled:process.env['CANX_CODEX_ENABLED']==='true' && process.env['CANX_CLAUDE_ENABLED']!=='false',maxBudgetUsd:CLAUDE_BUILD_MAX_USD},t,request,prNumber,runId):codexBuildsWith({...common,enabled:process.env['CANX_CODEX_ENABLED']==='true'},t,request,prNumber,runId);
 }},token,value);
}
