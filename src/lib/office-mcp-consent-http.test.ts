import {describe,it,expect,vi} from "vitest";
import {requestConsentDetails} from "./office-mcp-consent-http";
describe("Consent Auth transport",()=>{
 it("uses the Auth endpoint, verified owner token and portable abort signal",async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({scope:"openid"}),{status:200}));
  const result=await requestConsentDetails({url:"https://office.example",publishableKey:"public-key"},"/oauth/authorizations/request","owner-token",undefined,fetcher);
  expect(result).toEqual({ok:true,status:200,body:{scope:"openid"}});
  expect(fetcher).toHaveBeenCalledWith("https://office.example/auth/v1/oauth/authorizations/request",expect.objectContaining({method:"GET",redirect:"manual",signal:expect.any(AbortSignal),headers:expect.objectContaining({Authorization:"Bearer owner-token","X-Supabase-Api-Version":"2024-01-01"})}));
 });
 it("refuses arbitrary paths and never returns raw transport errors",async()=>{
  const fetcher=vi.fn(async()=>{throw Error("private credential");});
  await requestConsentDetails({url:"https://office.example",publishableKey:"public"},"/admin/users","token",undefined,fetcher);
  expect(fetcher).not.toHaveBeenCalled();
  const failed=await requestConsentDetails({url:"https://office.example",publishableKey:"public"},"/oauth/authorizations/request","token",undefined,fetcher);
  expect(failed).toMatchObject({ok:false,status:0,transportFailure:"network_or_runtime"});
  expect(JSON.stringify(failed)).not.toContain("private credential");
 });
});
