import { describe,it,expect,vi } from "vitest";
import { readConsentWith,decideConsentWith,safeConsentRedirect,validateConsentDetails,type ConsentDeps } from "./office-mcp-consent";
const details={authorization_id:"request",redirect_uri:"https://client.example/callback",client:{id:"00000000-0000-4000-8000-000000000001",name:"Client"},user:{id:"owner"},scope:"openid"};
const deps=():ConsentDeps=>({verify:async()=>({ok:true,userId:"owner",email:"",aal:"aal2"}),auth:async(path)=>({ok:true,body:path.endsWith("/consent")?{redirect_url:"https://client.example/callback?code=issued&state=returned"}:details}),register:vi.fn(async()=>true)});
describe("Owner-only Office consent",()=>{
 it("distinguishes service failures from invalid details without exposing raw errors",async()=>{
  const d=deps();d.auth=async()=>({ok:false,status:404,body:{secret:"private"}});
  expect((await readConsentWith(d,"token","request"))).toMatchObject({ok:false,message:expect.stringContaining("HTTP 404")});
  d.auth=async()=>{throw Error("private credential");};
  const result=await readConsentWith(d,"token","request");expect(result).toMatchObject({ok:false,message:expect.stringContaining("request unavailable")});expect(JSON.stringify(result)).not.toContain("private credential");
  d.auth=async()=>({ok:true,body:{...details,user:{id:"other"}}});
  expect(await readConsentWith(d,"token","request")).toMatchObject({ok:false,message:expect.stringContaining("did not match")});
 });
 it("refuses owner/MFA failure before reading or approving the request",async()=>{
  const d=deps();d.verify=async()=>({ok:true,userId:"owner",email:"",aal:"aal1"});d.auth=vi.fn();
  expect((await readConsentWith(d,"token","request")).ok).toBe(false);expect(d.auth).not.toHaveBeenCalled();
 });
 it("rejects requests for another owner, insecure callbacks and unrecognized scopes",()=>{
  expect(validateConsentDetails(details,"other")).toBeNull();
  expect(validateConsentDetails({...details,redirect_uri:"http://client.example/callback"},"owner")).toBeNull();
  expect(validateConsentDetails({...details,scope:"openid unknown"},"owner")).toBeNull();
 });
 it("requires exact registered callback origin/path before redirecting",()=>{
  expect(safeConsentRedirect("https://evil.example/callback?code=x",details.redirect_uri)).toBeNull();
  expect(safeConsentRedirect("https://client.example/other?code=x",details.redirect_uri)).toBeNull();
  expect(safeConsentRedirect("javascript:alert(1)",details.redirect_uri)).toBeNull();
 });
 it("saves explicit named-client approval only after valid owner consent",async()=>{
  const d=deps();const r=await decideConsentWith(d,{token:"token",authorizationId:"request",identity:"claude",approve:true});
  expect(r.ok).toBe(true);expect(d.register).toHaveBeenCalledExactlyOnceWith("token","request","claude");
 });
 it("denial never enables a client, and failed permission persistence never redirects",async()=>{
  const d=deps();expect((await decideConsentWith(d,{token:"token",authorizationId:"request",identity:"chatgpt",approve:false})).ok).toBe(true);expect(d.register).not.toHaveBeenCalled();
  d.register=async()=>false;const r=await decideConsentWith(d,{token:"token",authorizationId:"request",identity:"chatgpt",approve:true});expect(r.ok).toBe(false);expect(r).not.toHaveProperty("redirect");
 });
});
