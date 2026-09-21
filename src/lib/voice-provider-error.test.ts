import { describe,it,expect } from "vitest";
import { voiceProviderFailure } from "./voice-provider-error";
describe("voice provider diagnostics",()=>{
 it("separates exhausted credit from temporary rate limits",()=>{
  expect(voiceProviderFailure(429,{error:{code:"insufficient_quota"}})).toContain("billing allowance");
  expect(voiceProviderFailure(429,{error:{code:"rate_limit_exceeded"}},"12")).toContain("Wait at least 12 seconds");
 });
 it("does not invent a cause or echo raw errors, account ids, or hostile headers",()=>{
  const detail=voiceProviderFailure(429,{error:{code:"unknown-secret",message:"sk-secret org-private"}},"sk-secret");
  expect(detail).toContain("did not identify"); expect(detail).not.toContain("secret"); expect(detail).not.toContain("org-private");
  expect(voiceProviderFailure(429,null)).toContain("HTTP 429");
 });
});
