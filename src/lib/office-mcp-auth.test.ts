import { describe,it,expect,vi } from "vitest";
import { authorizeOfficeMcp, checkOfficeMcpAuthorization } from "./office-mcp-auth";
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
describe('Safe authorization failure stages',()=>{
 it.each([
  ['CANX_AUTH_REQUEST_FAILED',async()=>{throw Error('Bearer secret upstream detail');}],
  ['CANX_AUTH_HTTP_REJECTED',async()=>new Response('private upstream body',{status:401})],
  ['CANX_AUTH_RESPONSE_INVALID',async()=>new Response('invalid JSON')],
 ] as const)('reports %s without upstream text',async(code,f)=>{
  expect(await checkOfficeMcpAuthorization(config,token(),f)).toEqual({ok:false,code});
 });
 it('distinguishes issuer mismatch only after signature verification',async()=>{
  const f=vi.fn(async()=>Response.json({id:'owner'}));
  expect(await checkOfficeMcpAuthorization(config,token({...claims,iss:'https://wrong.example/auth/v1'}),f)).toEqual({ok:false,code:'CANX_AUTH_ISSUER_MISMATCH'});
  expect(f).toHaveBeenCalledOnce();
 });
 it.each([
  ['CANX_AUTH_SESSION_REQUEST_FAILED',async()=>{throw Error('private network detail');}],
  ['CANX_AUTH_SESSION_HTTP_REJECTED',async()=>new Response('private database detail',{status:403})],
  ['CANX_AUTH_SESSION_RESPONSE_INVALID',async()=>new Response('invalid JSON')],
  ['CANX_AUTH_SESSION_INACTIVE',async()=>Response.json(false)],
 ] as const)('reports %s and still denies access',async(code,session)=>{
  const f=vi.fn(async(url:unknown)=>String(url).endsWith('/user')?Response.json({id:'owner'}):session());
  expect(await checkOfficeMcpAuthorization(config,token(),f)).toEqual({ok:false,code});
  expect(await authorizeOfficeMcp(config,token(),f)).toBe(false);
 });
 it('preserves the successful decision and validates inputs without network calls',async()=>{
  const f=vi.fn(async(url:unknown)=>String(url).endsWith('/user')?Response.json({id:'owner'}):Response.json(true));
  expect(await checkOfficeMcpAuthorization(config,token(),f)).toEqual({ok:true});
  f.mockClear();
  expect(await checkOfficeMcpAuthorization(config,'bad',f)).toEqual({ok:false,code:'CANX_AUTH_INPUT_INVALID'});
  expect(f).not.toHaveBeenCalled();
 });
});
