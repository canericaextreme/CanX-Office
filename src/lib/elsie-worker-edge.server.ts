import { runPersistentWorkerTick, WORKER_REPO } from './elsie-worker-runtime.server';
export interface WorkerConfig {
 enabled: boolean;
 projectUrl: string;
 publishableKey: string;
 scopedWorkerJwt: string;
 pollToken: string;
 githubToken: string;
}
const PROJECT='https://gmsjjiprtulxojhkmbqb.supabase.co';
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function digest(text:string) {return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));}
async function sameSecret(a:string,b:string) {
 const [x,y]=await Promise.all([digest(a),digest(b)]);let difference=0;
 for(let i=0;i<x.length;i++)difference|=x[i]!^y[i]!;
 return difference===0;
}
/** Configuration is server-only. The JWT is a custom elsie_worker role bound
 * to one enrollment session, not a service_role key or an owner's session.
 */
export function createPersistentWorkerHandler(config:WorkerConfig,fetchImpl:typeof fetch=fetch) {
 return async(req:Request):Promise<Response>=>{
  if(req.method!=='POST')return json(405,{error:'method_not_allowed'});
  if(config.enabled!==true)return json(503,{state:'disabled'});
  if(config.projectUrl!==PROJECT||config.pollToken.length<32||!config.scopedWorkerJwt||!config.publishableKey||!config.githubToken)
   return json(503,{error:'worker_not_configured'});
  const authorization=req.headers.get('Authorization')??'';
  if(!await sameSecret(authorization,`Bearer ${config.pollToken}`))return json(401,{error:'unauthorized'});
  try {
   if(Number(req.headers.get('Content-Length')??0)>256)return json(413,{error:'payload_too_large'});
   const text=await req.text();if(text.length>256)return json(413,{error:'payload_too_large'});
   const body=JSON.parse(text);
   if(!body||Object.keys(body).length!==1||body.mode!=='poll')return json(400,{error:'invalid_poll'});
   const result=await runPersistentWorkerTick({enabled:true,
    rpc:async(name,args)=>{
     const response=await fetchImpl(`${PROJECT}/rest/v1/rpc/${name}`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{apikey:config.publishableKey,Authorization:`Bearer ${config.scopedWorkerJwt}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
     if(!response.ok)throw new Error('ledger_unavailable');
     const text=await response.text();return text?JSON.parse(text):null;
    },
    github:(path,init={})=>fetchImpl(`https://api.github.com/repos/${WORKER_REPO}${path}`,{...init,redirect:'error',signal:AbortSignal.timeout(15000),
     headers:{Authorization:`Bearer ${config.githubToken}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'CanX-Elsie-worker'}})
   });
   return json(200,{results:result});
  } catch {return json(503,{error:'worker_tick_unconfirmed',detail:'Inspect durable receipts. No dispatch retry is permitted.'});}
 };
}
