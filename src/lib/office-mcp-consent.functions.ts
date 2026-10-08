import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readConsentWith, decideConsentWith, type ConsentDeps } from "./office-mcp-consent";
const input = z.object({ accessToken: z.string().max(8192), authorizationId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/) });
async function dependencies(): Promise<ConsentDeps> {
  const backend = await import("./canx-backend.server");
  const config = backend.readBackendConfig();
  return {
    verify: backend.verifyOwner,
    auth: async (path,token,body) => {
      if (!config) return { ok:false,body:null };
      const response = await fetch(`${config.url}/auth/v1${path}`,{
        method:body===undefined ? "GET" : "POST",redirect:"error",signal:AbortSignal.timeout(10000),
        headers:{apikey:config.publishableKey,Authorization:`Bearer ${token}`,"Content-Type":"application/json","X-Supabase-Api-Version":"2024-01-01"},
        ...(body===undefined ? {} : {body:JSON.stringify(body)}),
      });
      return {ok:response.ok,status:response.status,body:await response.json().catch(()=>null)};
    },
    register: async (token,id,identity) => {
      if (!config) return false;
      const response = await backend.restRequest(config,token,"rpc/canx_approve_mcp_client",{method:"POST",body:JSON.stringify({_authorization_id:id,_identity:identity})});
      return response.ok && typeof response.body === "string" && /^[0-9a-f-]{36}$/i.test(response.body);
    },
  };
}
export const getOfficeConsent = createServerFn({method:"POST"}).validator(input.strict()).handler(async ({data}) => readConsentWith(await dependencies(),data.accessToken,data.authorizationId));
export const decideOfficeConsent = createServerFn({method:"POST"}).validator(input.extend({identity:z.enum(["chatgpt","claude"]),approve:z.boolean()}).strict()).handler(async ({data}) => decideConsentWith(await dependencies(),{token:data.accessToken,authorizationId:data.authorizationId,identity:data.identity,approve:data.approve}));
