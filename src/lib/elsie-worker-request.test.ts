import{describe,it,expect}from"vitest";
import{validateWorkerRequest,workerActivationState}from"./elsie-worker-request";
describe("Worker event boundary",()=>{
it("parses only poll or recognized merge",()=>{expect(validateWorkerRequest({mode:"poll"}).ok).toBe(true);expect(validateWorkerRequest({mode:"merge",repository:"canericaextreme/CanX-Office",pr:132,sha:"f".repeat(40)}).ok).toBe(true);});
it("refuses malformed and foreign events",()=>{expect(validateWorkerRequest(null).ok).toBe(false);expect(validateWorkerRequest({mode:"build"}).ok).toBe(false);expect(validateWorkerRequest({mode:"merge",repository:"wrong/repo",pr:1,sha:"f".repeat(40)}).ok).toBe(false);});
it("will not activate absent any one security gate",()=>{const s={enabled:true,scopedGrantVerified:true,ledgerVerified:true,leaseVerified:true};for(const k of Object.keys(s) as (keyof typeof s)[])expect(workerActivationState({...s,[k]:false}).ready).toBe(false);});
});