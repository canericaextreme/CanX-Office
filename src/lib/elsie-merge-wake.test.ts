import{describe,it,expect,vi}from"vitest";
import{receiveMergeWake}from"./elsie-merge-wake";
const e={pr:131,merged:true,base:"main",repo:"canericaextreme/CanX-Office",sha:"0123456789abcdef0123456789abcdef01234567"};
function deps(){return{seen:vi.fn(async()=>false),record:vi.fn(async()=>true),signalQueueCheck:vi.fn(async()=>true)};}
describe("Merge wake coordination",()=>{
it("records then signals a queue check, not a build",async()=>{const d=deps();expect((await receiveMergeWake(e,d)).state).toBe("signalled");expect(d.record).toHaveBeenCalledTimes(1);expect(d.signalQueueCheck).toHaveBeenCalledTimes(1);});
it("does not resignal known event",async()=>{const d=deps();d.seen.mockResolvedValue(true);expect((await receiveMergeWake(e,d)).state).toBe("already_seen");expect(d.signalQueueCheck).not.toHaveBeenCalled();});
it("stops without verified durable event",async()=>{const d=deps();d.record.mockResolvedValue(false);expect((await receiveMergeWake(e,d)).state).toBe("uncertain");expect(d.signalQueueCheck).not.toHaveBeenCalled();});
it("does not act on unmerged PR",async()=>{const d=deps();expect((await receiveMergeWake({...e,merged:false},d)).state).toBe("ignored");expect(d.record).not.toHaveBeenCalled();});
});