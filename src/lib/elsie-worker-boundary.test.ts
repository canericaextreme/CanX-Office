import { describe, expect, it } from "vitest";
import { decideUnattendedPoll, type PollGate } from "./elsie-worker-boundary";
const allowed: PollGate = { enabled:true,workerAuthenticated:true,currentGrant:true,ownerStopped:false,leaseHeld:true,budgetReserved:true,taskClaimed:true };
describe("unattended worker is fail closed", () => {
 it("accepts only all verified gates",()=>expect(decideUnattendedPoll(allowed).action).toBe("dispatch"));
 for (const [name, value] of Object.entries(allowed)) {
   it(`stops when ${name} becomes unsafe`,()=>{
     const broken = {...allowed,[name]:!value};
     expect(decideUnattendedPoll(broken).action).toBe("stop");
   });
 }
});
