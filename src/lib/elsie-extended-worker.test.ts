import { describe, expect, it, vi } from "vitest";
import { runElsieWorkTick } from "./elsie-extended-worker";
import type { ExtendedWorkSnapshot } from "./elsie-extended-work";
const snap: ExtendedWorkSnapshot = { now:"2026-10-16T12:00:00Z",sessionStartedAt:"2026-10-16T10:00:00Z",sessionExpiresAt:"2026-10-16T20:00:00Z",authorized:true,leaseOwned:true,ownerSessionValid:true,budgetCheckedAt:"2026-10-16T11:59:00Z",dailyBudgetRemainingCents:200,estimatedNextBuildCents:100,builderIdleVerified:true,inFlight:0,queued:1,taskGreen:true,hasOwnerQueueMarker:true,taskAlreadyAttempted:false,needsMergeOrDeploymentApproval:false,highRisk:false,statusReadSucceeded:true };
const task={id:"a",status:"open",risk:"green",worker:"codex",created_at:"2026-10-16T11:00:00Z",detail:"Build Analytics",evidence:"[elsie-queue codex 2026-10-16T11:00:00.000Z]"};
function deps(overrides:Partial<ExtendedWorkSnapshot>={}) {return {readSnapshot:vi.fn(async()=>({...snap,...overrides})),readTasks:vi.fn(async()=>[task]),claimAndDispatch:vi.fn(async()=>({submitted:true,detail:"sent"})),recordOutcome:vi.fn(async()=>undefined)};}
describe("One Elsie unattended tick",()=>{
 it("releases exactly one eligible task with verified budget and lease",async()=>{const d=deps();expect((await runElsieWorkTick("codex",d)).state).toBe("released");expect(d.claimAndDispatch).toHaveBeenCalledTimes(1);expect(d.recordOutcome).toHaveBeenCalledTimes(1);});
 it("stops expired sessions without dispatch",async()=>{const d=deps({now:snap.sessionExpiresAt});expect((await runElsieWorkTick("codex",d)).state).toBe("stopped");expect(d.claimAndDispatch).not.toHaveBeenCalled();});
 it("stops missing budget",async()=>{const d=deps({dailyBudgetRemainingCents:null});expect((await runElsieWorkTick("codex",d)).state).toBe("stopped");expect(d.claimAndDispatch).not.toHaveBeenCalled();});
 it("waits if the active builder is not idle",async()=>{const d=deps({builderIdleVerified:false});expect((await runElsieWorkTick("codex",d)).state).toBe("waiting");});
 it("never guesses other builder's queue",async()=>{const d=deps();expect((await runElsieWorkTick("claude",d)).state).toBe("waiting");expect(d.claimAndDispatch).not.toHaveBeenCalled();});
 it("does not automatically resubmit uncertain handoffs",async()=>{const d=deps();d.claimAndDispatch.mockResolvedValue({submitted:false,detail:"unknown"});expect((await runElsieWorkTick("codex",d)).state).toBe("uncertain");expect(d.claimAndDispatch).toHaveBeenCalledTimes(1);});
 it("halts when an audit write cannot be verified",async()=>{const d=deps();d.recordOutcome.mockRejectedValue(new Error("offline"));expect((await runElsieWorkTick("codex",d)).state).toBe("uncertain");});
});
