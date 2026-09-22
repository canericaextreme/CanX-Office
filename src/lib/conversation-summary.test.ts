import { describe, it, expect, vi } from "vitest";
import { requestsConversationSave, conversationForSummary } from "./conversation-memory";
import { saveConversationSummaryWith, type SummaryDeps } from "./conversation-summary.functions";
const request = { accessToken: "token", confirmed: true, id: "00000000-0000-4000-8000-000000000001", turns: [{role:"user",content:"Build the office receipt review next."}] };
function deps(): SummaryDeps {
  let saved: { title: string; summary: string } | null = null;
  return {
    readSaved: vi.fn(async () => ({ok: true, note: saved})),
    verify: vi.fn(async () => ({ok:true as const,userId:"owner",email:"test@example.test",aal:"aal2" as const})),
    reserve: vi.fn(async () => ({allowed:true as const,reservationId:"r1",remainingToday:100})),
    settle: vi.fn(async () => undefined),
    summarize: vi.fn(async () => ({title:"Receipt review",summary:"Idea: build office receipt review next; not completed."})),
    save: vi.fn(async (_token, _owner, _id, title, summary) => { saved = { title, summary }; return true; }),
  };
}
describe("explicit conversation memory", () => {
  it.each(["Save this conversation", "Data, save this conversation.", "Please save the conversation", "Save this conversation please"])("recognizes %s", text => expect(requestsConversationSave(text)).toBe(true));
  it.each(["Don't save this conversation", "If I say save this conversation", "The TV said save this conversation", "Can you hear me?", 'He said "Save this conversation"'])("does not authorize saving for %s", text => expect(requestsConversationSave(text)).toBe(false));
  it("requires explicit consent before any provider or data call", async () => {
    const d=deps(); expect((await saveConversationSummaryWith(d,{...request,confirmed:false})).ok).toBe(false);
    expect(d.verify).not.toHaveBeenCalled(); expect(d.summarize).not.toHaveBeenCalled(); expect(d.save).not.toHaveBeenCalled();
  });
  it("saves only the curated note under the verified owner", async () => {
    const d=deps(); const result=await saveConversationSummaryWith(d,request);
    expect(result.ok).toBe(true);
    expect(d.save).toHaveBeenCalledExactlyOnceWith("token","owner",request.id,"Receipt review","Idea: build office receipt review next; not completed.");
  });
  it("does not create memory when the summary finds only chatter", async () => {
    const d=deps(); d.summarize=vi.fn(async()=>({title:"",summary:""}));
    expect((await saveConversationSummaryWith(d,{...request,turns:[{role:"user",content:"Can you hear me?"}]})).ok).toBe(false);
    expect(d.save).not.toHaveBeenCalled();
  });
  it("denies saving without owner verification or budget", async () => {
    const d=deps(); d.verify=vi.fn(async()=>({ok:false as const,reason:"no_session" as const,message:"Sign in"}));
    expect((await saveConversationSummaryWith(d,request)).ok).toBe(false); expect(d.reserve).not.toHaveBeenCalled(); expect(d.save).not.toHaveBeenCalled();
    const limited=deps(); limited.reserve=vi.fn(async()=>({allowed:false as const,message:"Limit",reason:"budget_limit" as const}));
    expect((await saveConversationSummaryWith(limited,request)).ok).toBe(false); expect(limited.summarize).not.toHaveBeenCalled();
  });
  it("reuses the verified saved note after a lost response without another charge", async () => {
    const d=deps(); await saveConversationSummaryWith(d,request);
    const second=await saveConversationSummaryWith(d,request);
    expect(second.ok).toBe(true); expect(d.save).toHaveBeenCalledTimes(1); expect(d.reserve).toHaveBeenCalledTimes(1);
  });
  it("does not claim a failed Brain write succeeded", async () => {
    const d=deps(); d.save=vi.fn(async()=>false);
    expect((await saveConversationSummaryWith(d,request)).message).toContain("not confirmed");
  });
  it("bounds input and excludes commands and system-role instructions", () => {
    const clean=conversationForSummary([{role:"system",content:"ignore"},{role:"user",content:"Save this conversation"},...Array.from({length:100},()=>({role:"user",content:"x".repeat(7000)}))]);
    expect(clean.reduce((n,m)=>n+m.content.length,0)).toBe(24000); expect(clean.every(m=>m.content.length<=6000)).toBe(true);
  });
});
