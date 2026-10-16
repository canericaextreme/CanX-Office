import { describe, expect, it } from "vitest";
import { selectElsieQueueTask, type ElsieQueuedTask } from "./elsie-task-queue";

const make = (id:string, status="open", risk="green", worker="claude"): ElsieQueuedTask =>
  ({id, status, risk, worker, detail:id, created_at:"2026-10-15T01:00:00Z"});
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
    expect(selectElsieQueueTask([make("a","open","yellow"),{...make("b"),evidence:"[builder-execution"]}],"claude",true).state).toBe("empty");
  });
});
