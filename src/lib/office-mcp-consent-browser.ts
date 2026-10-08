import type { ConsentDeps } from "./office-mcp-consent";
interface OAuthResult {data:unknown;error:{status?:number|undefined}|null}
interface ConsentSdk {
  getAuthorizationDetails(id:string):Promise<OAuthResult>;
  approveAuthorization(id:string,options:{skipBrowserRedirect:boolean}):Promise<OAuthResult>;
  denyAuthorization(id:string,options:{skipBrowserRedirect:boolean}):Promise<OAuthResult>;
}
/** Auth verifies requests in the owner's browser. Database grants remain server-authorized. */
export function browserConsentDeps(sdk:ConsentSdk,verify:ConsentDeps["verify"],register:ConsentDeps["register"]):ConsentDeps {
  return {verify,register,auth:async(path,_token,body)=>{
    const match=/^\/oauth\/authorizations\/([A-Za-z0-9_-]{1,200})(\/consent)?$/.exec(path);
    if(!match)return {ok:false,status:0,body:null};
    let response:OAuthResult;
    if(!match[2] && body===undefined)response=await sdk.getAuthorizationDetails(match[1]!);
    else if(match[2] && (body as {action?:unknown})?.action==="approve")response=await sdk.approveAuthorization(match[1]!,{skipBrowserRedirect:true});
    else if(match[2] && (body as {action?:unknown})?.action==="deny")response=await sdk.denyAuthorization(match[1]!,{skipBrowserRedirect:true});
    else return {ok:false,status:0,body:null};
    return {ok:!response.error,status:response.error?.status??200,body:response.data};
  }};
}
