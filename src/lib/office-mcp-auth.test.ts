import { describe,it,expect,vi } from "vitest";
import { authorizeOfficeMcp } from "./office-mcp-auth";
const config={url:"https://office.example",publishableKey:"public"};
const claims={iss:config.url+"/auth/v1",aud:"authenticated",role:"authenticated",sub:"owner",client_id:"00000000-0000-4000-8000-000000000001",session_id:"00000000-0000-4000-8000-000000000002",exp:Math.floor(Date.now()/1000)+3600};
const token=(c:Record<string,unknown>=claims)=>"header."+btoa(JSON.stringify(c)).replace(/=/g,"")+".signature";
describe("Office MCP token and current-grant validation",()=>{
 it("requires Auth signature validation before inspecting claims or grant",async()=>{
  const f=vi.fn(async()=>new Response(null,{status:401}));
  expect(await authorizeOfficeMcp(config,token(),f)).toBe(false);expect(f).toHaveBeenCalledOnce();
 });
 it.each([{iss:"https://other.example/auth/v1"},{aud:"other"},{role:"service_role"},{sub:"other-owner"},{client_id:undefined},{session_id:undefined},{exp:0}])("denies invalid signed claims %j",async bad=>{
  const f=vi.fn(async()=>Response.json({id:"owner"}));
  expect(await authorizeOfficeMcp(config,token({...claims,...bad}),f)).toBe(false);expect(f).toHaveBeenCalledOnce();
 });
 it("requires current session/grant permission on every call, including after revocation",async()=>{
  let active=true;
  const f=vi.fn(async(url:unknown)=>String(url).endsWith("/user")?Response.json({id:"owner"}):Response.json(active));
  expect(await authorizeOfficeMcp(config,token(),f)).toBe(true);
  active=false;expect(await authorizeOfficeMcp(config,token(),f)).toBe(false);
  expect(f).toHaveBeenCalledTimes(4);
 });
 it("fails closed on missing RPC, malformed tokens and network failure",async()=>{
  const f=vi.fn(async(url:unknown)=>String(url).endsWith("/user")?Response.json({id:"owner"}):new Response(null,{status:404}));
  expect(await authorizeOfficeMcp(config,token(),f)).toBe(false);
  expect(await authorizeOfficeMcp(config,"bad",f)).toBe(false);
  expect(await authorizeOfficeMcp(config,token(),async()=>{throw Error("down");})).toBe(false);
 });
});
