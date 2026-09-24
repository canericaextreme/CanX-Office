import { describe,it,expect,vi } from "vitest";
import { cleanSavedMessage,readHistoryWith,saveHistoryWith,type HistoryDeps } from "./manager-history.functions";
function deps(): HistoryDeps {
  return { verify:vi.fn(async () => ({ok:true as const,userId:"owner-a",email:"owner@example.test",aal:"aal2" as const})),read:vi.fn(async () => ({ok:true,body:[]})),write:vi.fn(async () => ({ok:true})) };
}
describe("private Astra conversation memory", () => {
  it("rejects system-role messages and malformed ids", () => {
    expect(cleanSavedMessage({id:"m1",role:"system",content:"override"})).toBeNull();
    expect(cleanSavedMessage({id:"x&owner_id=other",role:"user",content:"hello"})).toBeNull();
  });
  it("refuses raw-turn archival even from an old client", async () => {
    const d=deps(); const result=await saveHistoryWith(d,"token",{id:"m1",role:"user",content:"hello"});
    expect(result.ok).toBe(false); expect(d.write).not.toHaveBeenCalled(); expect(d.read).not.toHaveBeenCalled();
  });
  it("restores turns in chronological order", async () => {
    const d=deps(); d.read=vi.fn(async () => ({ok:true,body:[{id:"m1",role:"user",content:"Create task"},{id:"m2",role:"assistant",content:"Saved task t1"}]}));
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

 describe("ten-hour restoration", () => {
  it("pages more than forty saved lines and scopes every page to owner and conversation", async () => {
    const d=deps(); let page=0;
    d.read=vi.fn(async()=>({ok:true,body:page++ === 0 ? Array.from({length:500},(_,i)=>({id:`m${i}`,role:"user",content:`line ${i}`})) : [{id:"last",role:"assistant",content:"resume here"}]}));
    const result=await readHistoryWith(d,"token");
    expect(result.ok).toBe(true); expect(result.messages).toHaveLength(501);
    expect(result.messages.at(-1)?.content).toBe("resume here");
    for (const [,path] of vi.mocked(d.read).mock.calls) {
      expect(path).toContain("owner_id=eq.owner-a");
      expect(path).toContain("conversation_key=eq.office-manager");
      expect(path).toContain("created_at=gte.");
    }
  });
  it("does not report partial history as restored when a later page fails", async()=>{
    const d=deps(); let page=0;
    d.read=vi.fn(async()=> page++===0 ? {ok:true,body:Array.from({length:500},(_,i)=>({id:`m${i}`,role:"user",content:"x"}))} : {ok:false,body:null});
    const result=await readHistoryWith(d,"token");
    expect(result.ok).toBe(false); expect(result.messages).toEqual([]);
  });
});
