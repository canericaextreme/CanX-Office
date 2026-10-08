import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const tokenInput=z.object({accessToken:z.string().max(8192)}).strict();
const approvalInput=tokenInput.extend({permission:z.literal('office-work-v1'),authorizationId:z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),identity:z.enum(["chatgpt","claude"])}).strict();
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
