import {describe,it,expect} from "vitest";
import {decideSchedulerTick,type SchedulerTickInput} from "./elsie-runner-admission";
const now="2026-10-17T02:00:00Z";
const sample:SchedulerTickInput={sessionId:"s",verifiedGrantSessionId:"s",now,expectedTaskId:"t",actualTaskId:"t",snapshot:{now,sessionStartedAt:"2026-10-16T20:00:00Z",sessionExpiresAt:"2026-10-17T06:00:00Z",authorized:true,leaseOwned:true,ownerSessionValid:true,budgetCheckedAt:"2026-10-17T01:59:00Z",dailyBudgetRemainingCents:500,estimatedNextBuildCents:200,builderIdleVerified:true,inFlight:0,queued:1,taskGreen:true,hasOwnerQueueMarker:true,taskAlreadyAttempted:false,needsMergeOrDeploymentApproval:false,highRisk:false,statusReadSucceeded:true},dailyBudget:{dayKey:"2026-10-17",now,dailyCapCents:800,settledCents:100,reservedCents:200,perBuildCapCents:250,providerRemainingCents:500,nextBuildUpperBoundCents:200,sourceVerifiedAt:"2026-10-17T01:59:00Z"}};
const test=(changes:Partial<SchedulerTickInput>={})=>decideSchedulerTick({...sample,...changes});
describe("Unattended scheduler admission",()=>{
 it("allows only matching verified grant, task and budget",()=>expect(test()).toEqual({action:"dispatch",taskId:"t"}));
 it("rejects no grant",()=>expect(test({verifiedGrantSessionId:null}).action).toBe("stop"));
 it("rejects a different task",()=>expect(test({actualTaskId:"other"}).action).toBe("wait"));
 it("rejects existing runs to prevent duplicates",()=>expect(test({existingRunId:100}).action).toBe("wait"));
 it("fails on different snapshot clock",()=>expect(test({now:"2026-10-17T02:01:00Z"}).action).toBe("stop"));
 it("fails if budget totals differ",()=>expect(test({snapshot:{...sample.snapshot,dailyBudgetRemainingCents:200}}).action).toBe("stop"));
 it("fails on stale provider credit",()=>expect(test({dailyBudget:{...sample.dailyBudget,providerRemainingCents:null}}).action).toBe("stop"));
 it("never exceeds ten hour window",()=>expect(test({snapshot:{...sample.snapshot,now:sample.snapshot.sessionExpiresAt},now:sample.snapshot.sessionExpiresAt}).action).toBe("stop"));
});
