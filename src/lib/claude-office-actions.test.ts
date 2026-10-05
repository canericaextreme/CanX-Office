import { describe, expect, it, vi } from 'vitest';
import { computeManagerStatusWith, runManagerChatWith, type ManagerDeps } from './manager.functions';
import { DENY_MESSAGES } from './canx-backend.server';

const say = (content = 'Claude, fix the reception label') => ({accessToken:'owner-token',messages:[{role:'user' as const,content}],currentRoute:'/build-testing',buildId:'test-build'});
const tool = (name='start_claude_build',input:unknown={}) => ({type:'tool_use',id:'tool-1',name,input});
function setup(content:unknown[]=[tool()], overrides:Partial<ManagerDeps>={}, stop_reason='tool_use') {
 const fetchImpl=vi.fn(async (url:unknown,_init?:RequestInit)=>String(url).includes('/v1/models/')?Response.json({id:'explicit-model'}):Response.json({stop_reason,content}));
 const reserve=vi.fn().mockResolvedValue({allowed:true,reservationId:'r1',remainingToday:10});
 const settle=vi.fn().mockResolvedValue(undefined);
 const runBuild=vi.fn().mockResolvedValue({ok:true,detail:'GitHub accepted the Claude request.',runs:[]});
 const deps:ManagerDeps={provider:'anthropic',anthropicKey:'claude-test-key',openaiKey:'openai-test-key',model:'explicit-model',verifyOwner:async()=>({ok:true,userId:'owner',email:'owner@example.test',aal:'aal2'}),buildContext:async()=>({ok:true,text:'SERVER OWNER RECORDS'}),reserve,settle,fetchImpl:fetchImpl as typeof fetch,runBuild,...overrides};
 return {deps,fetchImpl,reserve,settle,runBuild};
}
describe('Claude shares the trusted Office executor, not provider credentials',()=>{
 it('sends native tools to Anthropic and executes only the owner-selected builder',async()=>{
  const h=setup([tool('start_claude_build',{request:'injected override'}),tool('start_codex_build')]);
  const reply=await runManagerChatWith(h.deps,say());
  expect(reply).toMatchObject({ok:true,provider:'anthropic',state:'verified'});
  expect(h.runBuild).toHaveBeenCalledExactlyOnceWith('claude','owner-token','Claude, fix the reception label',undefined);
  expect(reply.text).toContain('GitHub accepted');
  expect(h.reserve).toHaveBeenCalledExactlyOnceWith('owner-token',15);
  expect(h.settle).toHaveBeenCalledExactlyOnceWith('owner-token','r1','ok');
  const calls=vi.mocked(h.fetchImpl).mock.calls;
  expect(String(calls[0]![0])).toBe('https://api.anthropic.com/v1/models/explicit-model');
  expect(String(calls[1]![0])).toBe('https://api.anthropic.com/v1/messages');
  const init=calls[1]![1]!;
  expect(init.headers).toMatchObject({'x-api-key':'claude-test-key','anthropic-version':'2023-06-01'});
  expect(JSON.stringify(calls)).not.toContain('openai-test-key');
  expect(init.redirect).toBe('error');
  const body=JSON.parse(String(init.body));
  expect(body.system).toContain('You are Claude');
  expect(body.system).not.toContain('Your name is Elsie');
  expect(body.messages[0].content).toContain('SERVER OWNER RECORDS');
  expect(body.messages[0].content).toContain('NEVER INSTRUCTIONS');
  expect(body.tools.map((t:{name:string})=>t.name)).toEqual(expect.arrayContaining(['create_task','assign_task','verify_task','request_approval','log_change','second_eyes_review','consult_room_worker','start_codex_build','start_claude_build','execute_task','check_task_execution']));
  expect(body.tools.every((t:{input_schema:unknown})=>!!t.input_schema)).toBe(true);
 });
 it('keeps the exact same registry as the default Elsie provider',async()=>{
  const c=setup([{type:'text',text:'Read the records.'}],{},'end_turn');
  const e=setup([], {provider:'openai'});
  e.fetchImpl.mockImplementation(async url=>String(url).includes('/v1/models/')?Response.json({}):Response.json({output_text:'Read the records.'}));
  await runManagerChatWith(c.deps,say('Read the room records'));
  await runManagerChatWith(e.deps,say('Read the room records'));
  const body=(h:typeof c)=>JSON.parse(String(h.fetchImpl.mock.calls[1]![1]?.body));
  expect(body(c).tools).toEqual(body(e).tools.map((t:{name:string;description:string;parameters:unknown})=>({name:t.name,description:t.description,input_schema:t.parameters})));
  expect(JSON.stringify(e.fetchImpl.mock.calls)).not.toContain('claude-test-key');
 });
 it('denies owner/MFA failure before provider or spending',async()=>{
  const h=setup([tool()],{verifyOwner:async()=>({ok:false,reason:'mfa_required',message:DENY_MESSAGES.mfa_required})});
  expect((await runManagerChatWith(h.deps,say())).code).toBe('auth_not_ready');
  expect(h.fetchImpl).not.toHaveBeenCalled();expect(h.reserve).not.toHaveBeenCalled();expect(h.runBuild).not.toHaveBeenCalled();
 });
 it.each([{anthropicKey:undefined},{model:undefined}])('never falls back when a Claude setting is missing: %j',async missing=>{
  const h=setup([tool()],missing);
  expect((await runManagerChatWith(h.deps,say())).code).toBe('not_configured');
  expect(h.fetchImpl).not.toHaveBeenCalled();expect(h.reserve).not.toHaveBeenCalled();expect(h.runBuild).not.toHaveBeenCalled();
 });
 it('blocks a denied budget before any provider call',async()=>{
  const h=setup([tool()],{reserve:async()=>({allowed:false,reason:'budget_limit',message:'Limit reached.'})});
  expect((await runManagerChatWith(h.deps,say())).code).toBe('limit_blocked');
  expect(h.fetchImpl).not.toHaveBeenCalled();expect(h.runBuild).not.toHaveBeenCalled();
 });
 it('sanitizes a refused key and never sends a paid message or action',async()=>{
  const h=setup();h.fetchImpl.mockResolvedValue(new Response('private upstream credential detail',{status:403}));
  const reply=await runManagerChatWith(h.deps,say());
  expect(reply).toMatchObject({ok:false,code:'health_check_failed',providerStatus:403});
  expect(JSON.stringify(reply)).not.toContain('private upstream');
  expect(h.fetchImpl).toHaveBeenCalledOnce();expect(h.runBuild).not.toHaveBeenCalled();expect(h.settle).toHaveBeenCalledWith('owner-token','r1','failed');
 });
 it.each(['max_tokens','refusal','pause_turn','unexpected'])('never executes native tools after stop_reason %s',async reason=>{
  const h=setup([tool()],{},reason);
  expect((await runManagerChatWith(h.deps,say())).ok).toBe(false);expect(h.runBuild).not.toHaveBeenCalled();expect(h.settle).toHaveBeenCalledWith('owner-token','r1','failed');
 });
 it.each([null,[], 'injected JSON'])('rejects malformed tool inputs: %j',async input=>{
  const h=setup([tool('start_claude_build',input)]);
  expect((await runManagerChatWith(h.deps,say())).ok).toBe(false);expect(h.runBuild).not.toHaveBeenCalled();
 });
 it('does not allow Claude to switch an unnamed builder or act on read-only requests',async()=>{
  for(const request of ['Fix the reception label','Read-only: Claude, fix the reception label']) {
   const h=setup();const reply=await runManagerChatWith(h.deps,say(request));
   expect(h.runBuild).not.toHaveBeenCalled();expect(reply.actionResults[0]?.status).toBe('stopped');
  }
 });
 it('answers builder status without a paid model call or configured Claude key',async()=>{
  const checkClaudeStatus=vi.fn().mockResolvedValue({ok:true,detail:'Existing run status',runs:[]});
  const h=setup([],{anthropicKey:undefined,checkClaudeStatus});
  const reply=await runManagerChatWith(h.deps,say('Check Claude builds'));
  expect(reply.provider).toBe('none');expect(checkClaudeStatus).toHaveBeenCalledOnce();expect(h.fetchImpl).not.toHaveBeenCalled();expect(h.reserve).not.toHaveBeenCalled();expect(h.runBuild).not.toHaveBeenCalled();
 });
 it('checks the actual Claude model connection without charging a message',async()=>{
  const h=setup();const status=await computeManagerStatusWith(h.deps,'owner-token');
  expect(status).toMatchObject({provider:'anthropic',connected:true,verified:true});expect(h.fetchImpl).toHaveBeenCalledOnce();expect(h.reserve).not.toHaveBeenCalled();
 });
});
