export interface McpAuthConfig { url:string; publishableKey:string }
/** Auth verifies the signature; the scoped RPC checks current owner, session,
 * client approval and grant. There is no cached allow decision or service key.
 */
export async function authorizeOfficeMcp(config:McpAuthConfig,token:string,fetchImpl:typeof fetch=fetch):Promise<boolean> {
  if(!config.url || !config.publishableKey || token.length>8192 || token.split(".").length!==3)return false;
  try {
    const headers={apikey:config.publishableKey,Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
    const userResponse=await fetchImpl(`${config.url}/auth/v1/user`,{headers,redirect:"error",signal:AbortSignal.timeout(8000)});
    if(!userResponse.ok)return false;
    const user=await userResponse.json();
    const base=token.split(".")[1]!.replace(/-/g,"+").replace(/_/g,"/");
    const claims=JSON.parse(atob(base+"=".repeat((4-base.length%4)%4)));
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(claims.iss!==`${config.url}/auth/v1` || claims.aud!=="authenticated" || claims.role!=="authenticated" ||
       typeof user.id!=="string" || claims.sub!==user.id || !uuid.test(claims.client_id??"") ||
       !uuid.test(claims.session_id??"") || typeof claims.exp!=="number" || claims.exp*1000<=Date.now())return false;
    const active=await fetchImpl(`${config.url}/rest/v1/rpc/canx_mcp_session_active`,{method:"POST",headers,body:"{}",redirect:"error",signal:AbortSignal.timeout(8000)});
    return active.ok && await active.json()===true;
  }catch{return false;}
}
