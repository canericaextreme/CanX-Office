import {describe,it,expect,vi} from "vitest";
import {browserConsentDeps} from "./office-mcp-consent-browser";
import {decideConsentWith} from "./office-mcp-consent";
const details={authorization_id:"request",redirect_uri:"https://client.example/callback",client:{id:"00000000-0000-4000-8000-000000000001",name:"ChatGPT"},user:{id:"owner"},scope:"openid email offline_access"};
describe("Browser OAuth consent with server-authorized grants",()=>{
 it("uses SDK requests without auto-redirect, and saves the grant before returning the callback",async()=>{
  const sdk={getAuthorizationDetails:vi.fn(async()=>({data:details,error:null})),approveAuthorization:vi.fn(async()=>({data:{redirect_url:"https://client.example/callback?code=x"},error:null})),denyAuthorization:vi.fn()};
  const register=vi.fn(async()=>true);
  const deps=browserConsentDeps(sdk,async()=>({ok:true,userId:"owner",email:"",aal:"aal2"}),register);
  expect(await decideConsentWith(deps,{token:"owner-token",authorizationId:"request",identity:"chatgpt",approve:true})).toEqual({ok:true,redirect:"https://client.example/callback?code=x"});
  expect(sdk.approveAuthorization).toHaveBeenCalledWith("request",{skipBrowserRedirect:true});
  expect(register).toHaveBeenCalledWith("owner-token","request","chatgpt");
 });
 it("never grants access or follows a callback if server permission persistence fails",async()=>{
  const sdk={getAuthorizationDetails:vi.fn(async()=>({data:details,error:null})),approveAuthorization:vi.fn(async()=>({data:{redirect_url:"https://client.example/callback?code=x"},error:null})),denyAuthorization:vi.fn()};
  const result=await decideConsentWith(browserConsentDeps(sdk,async()=>({ok:true,userId:"owner",email:"",aal:"aal2"}),async()=>false),{token:"token",authorizationId:"request",identity:"chatgpt",approve:true});
  expect(result.ok).toBe(false);expect(result).not.toHaveProperty("redirect");
 });
});
