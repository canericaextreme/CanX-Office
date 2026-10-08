import { officeMcpWorkWith } from "../../../src/lib/office-mcp-work-service.ts";
import { handleOfficeMcp } from "../../../src/lib/office-mcp.ts";
import { authorizeOfficeMcp } from "../../../src/lib/office-mcp-auth.ts";
import { statusText } from "../../../src/lib/office-status.ts";
import plan from "../../../docs/office-connection-plan.json" with { type: "json" };

const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

Deno.serve(request => {
  // Supabase's gateway removes /functions/v1 before forwarding to Deno.
  // Restore the public resource path without accepting arbitrary suffixes.
  const forwarded = new URL(request.url);
  if (forwarded.pathname === "/office-mcp" || forwarded.pathname.startsWith("/office-mcp/")) {
    forwarded.pathname = `/functions/v1${forwarded.pathname}`;
  }
  return handleOfficeMcp(new Request(forwarded, request), {
    resource: `${url}/functions/v1/office-mcp`,
    issuer: `${url}/auth/v1`,
    authorize: token => authorizeOfficeMcp({url,publishableKey:key},token),
    work: (token,name,args)=>officeMcpWorkWith({url,key,serviceKey:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),fetch:(input,init)=>fetch(input,init)},token,name,args),
    plan: () => structuredClone(plan),
    status: async token => {
      const r=await fetch(`${url}/rest/v1/rpc/canx_mcp_office_status`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:"{}",redirect:"error",signal:AbortSignal.timeout(8000)});
      if(!r.ok)throw Error("Office read unavailable");
      const value=await r.json();
      if(!value || !Array.isArray(value.projects) || !Array.isArray(value.tasks))throw Error("Invalid Office read");
      return {...value,projects:value.projects.map((p:Record<string,unknown>)=>({...p,name:statusText(p.name,160)}))};
    },
  });
});
