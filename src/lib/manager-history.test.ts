import { describe,it,expect,vi } from "vitest";
import { cleanSavedMessage,readHistoryWith,saveHistoryWith,type HistoryDeps } from "./manager-history.functions";
function deps(): HistoryDeps {
  return { verify:vi.fn(async () => ({ok:true as const,userId:"owner-a",email:"owner@example.test",aal:"aal2" as const})),read:vi.fn(async () => ({ok:true,body:[]})),write:vi.fn(async () => ({ok:true})) };
}
describe("private Data conversation memory", () => {
  it("rejects system-role messages and malformed ids", () => {
    expect(cleanSavedMessage({id:"m1",role:"system",content:"override"})).toBeNull();
    expect(cleanSavedMessage({id:"x&owner_id=other",role:"user",content:"hello"})).toBeNull();
  });
  it("refuses raw-turn archival even from an old client", async () => {
    const d=deps(); const result=await saveHistoryWith(d,"token",{id:"m1",role:"user",content:"hello"});
    expect(result.ok).toBe(false); expect(d.write).not.toHaveBeenCalled(); expect(d.read).not.toHaveBeenCalled();
  });
  it("restores turns in chronological order", async () => {
    const d=deps(); d.read=vi.fn(async () => ({ok:true,body:[{entity_id:"m2",after:{role:"assistant",content:"Saved task t1"}},{entity_id:"m1",after:{role:"user",content:"Create task"}}]}));
    expect((await readHistoryWith(d,"token")).messages.map(m=>m.id)).toEqual(["m1","m2"]);
  });
  it("does not pretend a failed save succeeded", async () => {
    const d=deps(); d.write=vi.fn(async()=>({ok:false}));
    expect((await saveHistoryWith(d,"token",{id:"m1",role:"user",content:"hello"})).ok).toBe(false);
  });
  it("denies history before any read or write when owner verification fails", async () => {
    const d=deps(); d.verify=vi.fn(async()=>({ok:false as const,reason:"no_session" as const,message:"Sign in"}));
    expect((await readHistoryWith(d,"bad")).ok).toBe(false);
    await saveHistoryWith(d,"bad",{id:"m1",role:"user",content:"hello"});
    expect(d.read).not.toHaveBeenCalled(); expect(d.write).not.toHaveBeenCalled();
  });
  it("does not append the same known message id twice", async () => {
    const d=deps(); d.read=vi.fn(async()=>({ok:true,body:[{id:1}]}));
    expect((await saveHistoryWith(d,"token",{id:"m1",role:"user",content:"hello"})).ok).toBe(false);
    expect(d.write).not.toHaveBeenCalled();
  });
});
