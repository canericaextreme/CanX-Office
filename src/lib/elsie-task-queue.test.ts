import { describe, expect, it } from "vitest";
import { selectElsieQueueTask, dispatchSelectedElsieTask, type ElsieQueuedTask } from "./elsie-task-queue";

const make = (id:string, status="open", risk="green", worker="claude"): ElsieQueuedTask =>
  ({id, status, risk, worker, detail:id, created_at:"2026-10-15T01:00:00Z", evidence:"[elsie-queue claude 2026-10-15T01:00:00.000Z]"});
describe("Elsie queue is fail-closed and ordered",()=>{
  it("will not dispatch until availability is verified",()=>{
    expect(selectElsieQueueTask([make("a")],"claude",false).state).toBe("blocked");
  });
  it("holds another build while one is running",()=>{
    expect(selectElsieQueueTask([make("a","in_progress"),make("b")],"claude",true).state).toBe("blocked");
  });
  it("picks the earliest eligible task deterministically",()=>{
    const a=make("a"); const b={...make("b"), created_at:"2026-10-15T02:00:00Z"};
    expect(selectElsieQueueTask([b,a],"claude",true)).toMatchObject({state:"ready",task:{id:"a"}});
  });
  it("does not select protected or previously attempted tasks",()=>{
    expect(selectElsieQueueTask([make("a","open","yellow"),{...make("b"),evidence:"[builder-execution]"}],"claude",true).state).toBe("empty");
  });
  it("only selects tasks John queued for that builder",()=>{
    expect(selectElsieQueueTask([{...make("a"),evidence:""}],"claude",true).state).toBe("empty");
    expect(selectElsieQueueTask([make("a")],"codex",true).state).toBe("empty");
  });
});

describe("claim-first dispatch",()=>{
  it("does not execute on a failed claim",async()=>{
    let called = false;
    const result=await dispatchSelectedElsieTask({state:"ready",task:make("a")},{
      claim:async()=>({ok:false,reason:"already_attempted"}),
      execute:async()=>{called=true; return {ok:true,detail:"sent"};}
    });
    expect(called).toBe(false);
    expect(result.submitted).toBe(false);
  });
  it("dispatches exactly once following a successful claim",async()=>{
    let count=0;
    const result=await dispatchSelectedElsieTask({state:"ready",task:make("a")},{
      claim:async()=>({ok:true}),
      execute:async()=>{count++;return {ok:true,detail:"queued"};}
    });
    expect(count).toBe(1);
    expect(result.submitted).toBe(true);
  });
});
