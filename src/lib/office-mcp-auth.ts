export interface McpAuthConfig { url:string; publishableKey:string }
export const MCP_AUTH_FAILURE_CODES = ['CANX_AUTH_INPUT_INVALID','CANX_AUTH_REQUEST_FAILED','CANX_AUTH_URL_INVALID','CANX_AUTH_HEADER_INVALID','CANX_AUTH_FETCH_INVOCATION_FAILED','CANX_AUTH_REQUEST_TIMEOUT','CANX_AUTH_NETWORK_FAILED','CANX_AUTH_HTTP_REJECTED','CANX_AUTH_RESPONSE_INVALID','CANX_AUTH_ISSUER_MISMATCH','CANX_AUTH_CLAIMS_INVALID','CANX_AUTH_SESSION_REQUEST_FAILED','CANX_AUTH_SESSION_HTTP_REJECTED','CANX_AUTH_SESSION_RESPONSE_INVALID','CANX_AUTH_SESSION_INACTIVE'] as const;
export type McpAuthorization = {ok:true} | {ok:false;code:typeof MCP_AUTH_FAILURE_CODES[number]};
/** Classify known runtime failures without returning their message or cause. */
function authRequestFailure(error:unknown):typeof MCP_AUTH_FAILURE_CODES[number] {
  if(!(error instanceof Error))return 'CANX_AUTH_REQUEST_FAILED';
  if(/illegal invocation|invalid receiver/i.test(error.message))return 'CANX_AUTH_FETCH_INVOCATION_FAILED';
  if(/invalid character.*header|header.*invalid character/i.test(error.message))return 'CANX_AUTH_HEADER_INVALID';
  if(/invalid url|failed to parse url|unable to parse url/i.test(error.message))return 'CANX_AUTH_URL_INVALID';
  if(error.name==='AbortError'||error.name==='TimeoutError')return 'CANX_AUTH_REQUEST_TIMEOUT';
  const cause=error.cause;
  const code=cause && typeof cause==='object' && 'code' in cause?cause.code:undefined;
  if(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID'].includes(String(code)) || /network connection lost|fetch failed/i.test(error.message))return 'CANX_AUTH_NETWORK_FAILED';
  return 'CANX_AUTH_REQUEST_FAILED';
}
/** Auth verifies the signature; the scoped RPC checks current owner, session,
 * client approval and grant. There is no cached allow decision or service key.
 */
export async function checkOfficeMcpAuthorization(config:McpAuthConfig,token:string,fetchImpl:typeof fetch=fetch):Promise<McpAuthorization> {
  if(!config.url || !config.publishableKey || token.length>8192 || token.split(".").length!==3)return {ok:false,code:'CANX_AUTH_INPUT_INVALID'};
  let failure:typeof MCP_AUTH_FAILURE_CODES[number]='CANX_AUTH_REQUEST_FAILED';
  try {
    const headers={apikey:config.publishableKey,Authorization:`Bearer ${token}`,"Content-Type":"application/json"};
    const userResponse=await fetchImpl(`${config.url}/auth/v1/user`,{headers,redirect:"manual",signal:AbortSignal.timeout(8000)});
    if(!userResponse.ok)return {ok:false,code:'CANX_AUTH_HTTP_REJECTED'};
    failure='CANX_AUTH_RESPONSE_INVALID';
    const user=await userResponse.json();
    failure='CANX_AUTH_CLAIMS_INVALID';
    const base=token.split(".")[1]!.replace(/-/g,"+").replace(/_/g,"/");
    const claims=JSON.parse(atob(base+"=".repeat((4-base.length%4)%4)));
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(claims.iss!==`${config.url}/auth/v1`)return {ok:false,code:'CANX_AUTH_ISSUER_MISMATCH'};
    if(claims.aud!=="authenticated" || claims.role!=="authenticated" ||
       typeof user?.id!=="string" || claims.sub!==user.id || !uuid.test(claims.client_id??"") ||
       !uuid.test(claims.session_id??"") || typeof claims.exp!=="number" || claims.exp*1000<=Date.now())return {ok:false,code:'CANX_AUTH_CLAIMS_INVALID'};
    failure='CANX_AUTH_SESSION_REQUEST_FAILED';
    const active=await fetchImpl(`${config.url}/rest/v1/rpc/canx_mcp_session_active`,{method:"POST",headers,body:"{}",redirect:"manual",signal:AbortSignal.timeout(8000)});
    if(!active.ok)return {ok:false,code:'CANX_AUTH_SESSION_HTTP_REJECTED'};
    failure='CANX_AUTH_SESSION_RESPONSE_INVALID';
    return await active.json()===true?{ok:true}:{ok:false,code:'CANX_AUTH_SESSION_INACTIVE'};
  }catch(error){return {ok:false,code:failure==='CANX_AUTH_REQUEST_FAILED'?authRequestFailure(error):failure};}
}
export async function authorizeOfficeMcp(config:McpAuthConfig,token:string,fetchImpl:typeof fetch=fetch):Promise<boolean> {
  return (await checkOfficeMcpAuthorization(config,token,fetchImpl)).ok;
}
