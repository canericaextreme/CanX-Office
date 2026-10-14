import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const tokenInput=z.object({accessToken:z.string().max(8192)}).strict();
const approvalInput=tokenInput.extend({permission:z.literal('office-work-v1'),authorizationId:z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),identity:z.enum(["chatgpt","claude"])}).strict();
const isolatedInput=tokenInput.extend({authorizationId:z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),identity:z.enum(['chatgpt','claude']),action:z.enum(['read','approve','deny'])}).strict();
export const isolatedOfficeConsent=createServerFn({method:'POST'}).validator(isolatedInput).handler(async({data}):Promise<import('./office-assistant-consent').AssistantConsentResult>=>{
  const backend=await import('./canx-backend.server');
  const config=backend.readBackendConfig();
  const blocked={ok:false as const,message:'Isolated Office sign-in is unavailable. No access was confirmed.'};
  if(!config)return blocked;
  try{
    const r=await fetch(`${config.url}/functions/v1/office-consent`,{method:'POST',headers:{apikey:config.publishableKey,Authorization:`Bearer ${data.accessToken}`,'Content-Type':'application/json'},
      // Cloudflare Workers reject the 'error' redirect mode before sending; refuse redirects manually instead.
      body:JSON.stringify({authorizationId:data.authorizationId,identity:data.identity,action:data.action}),redirect:'manual',signal:AbortSignal.timeout(55_000)});
    if(r.status>=300&&r.status<400)return blocked;
    const value=await r.json();
    if(!r.ok||!value||value.ok!==true)return blocked;
    if(data.action==='read'){
      const {decodeClaims}=backend;
      const {validateConsentDetails}=await import('./office-mcp-consent');
      const uid=decodeClaims(data.accessToken)?.['sub'];
      const details=typeof uid==='string'?validateConsentDetails(value.details,uid):null;
      return details?{ok:true,details}:blocked;
    }
    return typeof value.redirect==='string'?{ok:true,redirect:value.redirect}:blocked;
  }catch{return blocked;}
});
export const verifyOfficeConsentOwner=createServerFn({method:"POST"}).validator(tokenInput).handler(async({data})=>{
  const backend=await import("./canx-backend.server");
  return backend.verifyOwner(data.accessToken);
});
export const registerOfficeConsentClient=createServerFn({method:"POST"}).validator(approvalInput).handler(async({data})=>{
  const backend=await import("./canx-backend.server");
  const owner=await backend.verifyOwner(data.accessToken);
  if(!owner.ok || owner.aal!=="aal2")return false;
  const config=backend.readBackendConfig();if(!config)return false;
  const response=await backend.restRequest(config,data.accessToken,"rpc/canx_approve_office_work",{method:"POST",body:JSON.stringify({_authorization_id:data.authorizationId,_identity:data.identity})},(url,init)=>fetch(url,init));
  return response.ok && typeof response.body==="string" && /^[0-9a-f-]{36}$/i.test(response.body);
});
