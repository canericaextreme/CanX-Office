import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
export interface AssistantConnection { client_id:string; identity:'chatgpt'|'claude'; enabled:boolean; isolated:boolean; connected:boolean }
const token=z.object({accessToken:z.string().max(8192)}).strict();
export const readAssistantConnections=createServerFn({method:'POST'}).validator(token).handler(async({data}):Promise<{ok:true;connections:AssistantConnection[]}|{ok:false;message:string}>=>{
  const b=await import('./canx-backend.server');
  const owner=await b.verifySignedIn(data.accessToken);const c=b.readBackendConfig();
  if(!owner.ok||!c)return {ok:false,message:'Owner connection status could not be read.'};
  const r=await b.restRequest(c,data.accessToken,'rpc/canx_mcp_connections_status',{method:'POST',body:'{}'});
  if(!r.ok||!Array.isArray(r.body))return {ok:false,message:'Connection status is unavailable; access has not been confirmed.'};
  return {ok:true,connections:r.body as AssistantConnection[]};
});
export const revokeAssistantConnection=createServerFn({method:'POST'}).validator(token.extend({clientId:z.string().uuid()}).strict()).handler(async({data})=>{
  const b=await import('./canx-backend.server');
  const owner=await b.verifySignedIn(data.accessToken);const c=b.readBackendConfig();
  if(!owner.ok||!c)return {ok:false,message:'Owner sign-in required.'};
  const r=await b.restRequest(c,data.accessToken,'rpc/canx_mcp_client_revoke',{method:'POST',body:JSON.stringify({_client_id:data.clientId})});
  return r.ok&&r.body===true?{ok:true,message:'This Office connection is off. Other connections are unchanged.'}:{ok:false,message:'The connection could not be switched off.'};
});
