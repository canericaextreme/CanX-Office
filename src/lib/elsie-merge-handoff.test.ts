import {describe,it,expect} from "vitest";
import {planMergeHandoff} from "./elsie-merge-handoff";
const e={pr:130,merged:true,base:"main",repo:"canericaextreme/CanX-Office",sha:"0123456789abcdef0123456789abcdef01234567"};
describe("Merge handoff safety",()=>{
 it("identifies valid merged PR idempotently",()=>{expect(planMergeHandoff(e).eligible).toBe(true);expect(planMergeHandoff(e).key).toBe(planMergeHandoff(e).key);});
 it("does not use nonmerged PR",()=>expect(planMergeHandoff({...e,merged:false}).eligible).toBe(false));
 it("ignores other repositories and branches",()=>{expect(planMergeHandoff({...e,repo:"other/repo"}).eligible).toBe(false);expect(planMergeHandoff({...e,base:"develop"}).eligible).toBe(false);});
 it("rejects invalid identifiers",()=>expect(planMergeHandoff({...e,sha:"oops"}).eligible).toBe(false));
});
