import { describe, it, expect, vi } from 'vitest';
import { handoffTextWith, requestsTextHandoff, type TextHandoffDeps } from './text-colleague-handoff';
import type { ManagerTask, WorkbenchDeps } from './manager-work.functions';
const task: ManagerTask = { id:'task-1',owner_id:'owner',title:'Welcome note',detail:'Write a simple welcome note.',status:'open',risk:'green',worker:'Office Manager',result:'Previous reply',evidence:'Claude reviewed the draft',created_at:'2026-10-07T00:00:00Z',updated_at:'2026-10-07T00:00:00Z' };
const input = { accessToken:'token',taskId:task.id,instruction:'Revise with Claude feedback.',currentRequest:'Hand task-1 writing task to ChatGPT. No builds. Save the revised note on the same job.' };
function fixture() {
  let row = {...task};
  const rest = vi.fn(async (_token: string, method: string, _path: string, body?: Record<string,unknown>) => {
    if (method === 'PATCH') row = {...row,...body} as ManagerTask;
    return {ok:true,data:[{...row}]};
  });
  const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(JSON.stringify({id:'resp-proof',status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Welcome. We are testing our teamwork.'}]}]}),{status:200}));
  const deps: TextHandoffDeps = { workbench: {verifyOwner:vi.fn(async()=>({ok:true as const,userId:'owner',email:'owner@example.com',aal:'aal2'})),ensureBudget:vi.fn(async()=>({ok:true})),rest: rest as WorkbenchDeps['rest'],reserve:vi.fn(async()=>({allowed:true as const,reservationId:'reserve-1',remainingToday:100})),settle:vi.fn(async()=>{})},fetchImpl: fetchImpl as typeof fetch,openaiKey:'test-key',model:'test-model',now:()=>new Date('2026-10-07T01:00:00Z') };
  return {deps,rest,fetchImpl,row:()=>row};
}
describe('Office writing handoff',()=>{
  it('accepts explicit writing with no builds, refuses discussion and withheld handoffs',()=>{
    expect(requestsTextHandoff(input.currentRequest)).toBe(true);
    for(const request of ['Explain how ChatGPT would write a note','For example, hand a note to ChatGPT','Do not send this draft to ChatGPT','Read-only: ask ChatGPT to revise this']) expect(requestsTextHandoff(request)).toBe(false);
  });
  it('uses one no-tools call and appends a verified receipt without completing or reassigning the task',async()=>{
    const f=fixture(); const reply=await handoffTextWith(f.deps,input);
    expect(reply.ok).toBe(true); expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    const body=JSON.parse(f.fetchImpl.mock.calls[0]![1]!.body as string);
    expect(f.fetchImpl.mock.calls[0]?.[1]?.redirect).toBe('manual');
    expect(body.tools).toBeUndefined(); expect(body.store).toBe(false); expect(body.model).toBe('test-model');
    expect(f.row()).toMatchObject({status:'open',worker:'Office Manager'});
    expect(f.row().result).toContain('Previous reply'); expect(f.row().result).toContain(reply.text);
    expect(f.row().evidence).toContain('Claude reviewed'); expect(f.row().evidence).toContain('resp-proof');
    expect(f.rest.mock.calls.find(x=>x[1]==='PATCH')?.[2]).toContain('updated_at=eq.2026-10-07T00%3A00%3A00Z&status=eq.open');
    expect(f.deps.workbench.settle).toHaveBeenCalledOnce();
  });
  it('refuses redirects without saving a reply or trying another destination',async()=>{
    const f=fixture();f.fetchImpl.mockImplementation(async()=>new Response(null,{status:302,headers:{Location:'https://untrusted.example'}}));
    const reply=await handoffTextWith(f.deps,input);expect(reply.ok).toBe(false);expect(f.fetchImpl).toHaveBeenCalledTimes(1);expect(f.rest.mock.calls.every(x=>x[1]==='GET')).toBe(true);
  });
  it('denies an unverified owner before any data or provider call',async()=>{
    const f=fixture();f.deps.workbench.verifyOwner=async()=>({ok:false,reason:'mfa_required',message:'Authenticator required.'});
    expect((await handoffTextWith(f.deps,input)).ok).toBe(false);expect(f.rest).not.toHaveBeenCalled();expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('does not use an Anthropic model or paid fallback when OpenAI model is missing',async()=>{
    const f=fixture();f.deps.model=undefined;expect((await handoffTextWith(f.deps,input)).ok).toBe(false);expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('stops on budget denial without calling a provider',async()=>{
    const f=fixture();f.deps.workbench.reserve=async()=>({allowed:false,reason:'budget_limit',message:'Budget blocked.'});
    expect((await handoffTextWith(f.deps,input)).ok).toBe(false);expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects incomplete output and leaves all saved text unchanged',async()=>{
    const f=fixture();f.fetchImpl.mockImplementation(async()=>new Response(JSON.stringify({id:'resp-cut',status:'incomplete',output_text:'Partial'})));
    expect((await handoffTextWith(f.deps,input)).ok).toBe(false);expect(f.rest.mock.calls.every(x=>x[1]==='GET')).toBe(true);
  });
  it('keeps the reply for recovery after a conflict without repeating the paid call',async()=>{
    const f=fixture();f.rest.mockImplementation(async(_t,m)=> m==='PATCH'?{ok:true,data:[]}:{ok:true,data:[{...task}]});
    const reply=await handoffTextWith(f.deps,input);expect(reply.ok).toBe(false);expect(reply.text).toContain('Welcome');expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('does not claim saved delivery when readback disagrees',async()=>{
    const f=fixture();let reads=0;f.rest.mockImplementation(async(_t,m)=>({ok:true,data:[m==='GET'&&++reads>1?{...task,result:'other'}:{...task}]}));
    const reply=await handoffTextWith(f.deps,input);expect(reply.ok).toBe(false);expect(reply.detail).toContain('readback');expect(reply.text).toBeDefined();
  });
  it('refuses closed and foreign tasks before calling the provider',async()=>{
    for(const row of [{...task,status:'done' as const},{...task,owner_id:'other'}]){
      const f=fixture();f.rest.mockImplementation(async()=>({ok:true,data:[row]}));expect((await handoffTextWith(f.deps,input)).ok).toBe(false);expect(f.fetchImpl).not.toHaveBeenCalled();
    }
  });
});
