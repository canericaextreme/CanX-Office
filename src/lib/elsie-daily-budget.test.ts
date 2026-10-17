import {describe,it,expect} from "vitest";
import {checkElsieDailyBudget,type DailyBuildBudget} from "./elsie-daily-budget";
const good:DailyBuildBudget={dayKey:"2026-10-17",now:"2026-10-17T02:00:00Z",dailyCapCents:800,settledCents:100,reservedCents:200,perBuildCapCents:250,providerRemainingCents:1000,nextBuildUpperBoundCents:200,sourceVerifiedAt:"2026-10-17T01:59:00Z"};
const check=(x:Partial<DailyBuildBudget>={})=>checkElsieDailyBudget({...good,...x});
describe("Elsie authoritative daily budget admission",()=>{
 it("accepts available reserved capacity",()=>expect(check()).toMatchObject({ok:true,availableCents:500}));
 it("refuses missing provider balance",()=>expect(check({providerRemainingCents:null}).ok).toBe(false));
 it("refuses stale evidence",()=>expect(check({sourceVerifiedAt:"2026-10-17T01:30:00Z"}).ok).toBe(false));
 it("refuses an exhausted provider",()=>expect(check({providerRemainingCents:100}).ok).toBe(false));
 it("counts existing reserved costs",()=>expect(check({reservedCents:600}).ok).toBe(false));
 it("refuses an oversized job",()=>expect(check({nextBuildUpperBoundCents:300}).ok).toBe(false));
 it("does not roll over the wrong accounting day",()=>expect(check({dayKey:"2026-10-16"}).ok).toBe(false));
 it("refuses negative and fractional costs",()=>{expect(check({settledCents:-1}).ok).toBe(false);expect(check({nextBuildUpperBoundCents:1.5}).ok).toBe(false)});
});
