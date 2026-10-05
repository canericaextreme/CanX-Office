import {useEffect,useRef,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {useOwnerSession} from '@/lib/owner-session';
import {claudeBuildOperation} from '@/lib/claude-builds.functions';
import type {ClaudeBuildResult} from '@/lib/claude-builds.server';
import {invokeOfficeClaude,type ClaudeModel} from '@/lib/claude-chat';
import {Button} from '@/components/ui/button';
import {managerChat,type ManagerReply} from '@/lib/manager.functions';
import {currentBuildVersion} from '@/lib/office-health';

/** Shows Elsie's verified action results from an explicit handoff. Not Claude tool use. */
export function ElsieHandoffResult({reply}:{reply:ManagerReply}) {
 return <div role="region" aria-label="Elsie handoff result" className="space-y-2 rounded border p-3 text-sm">
  <p className="font-medium">Elsie's result (Office actions are carried out by Elsie, not by Claude)</p>
  {!reply.ok&&<p>{reply.detail??'Elsie could not complete this handoff.'}</p>}
  {reply.text&&<p className="whitespace-pre-wrap">{reply.text}</p>}
  {reply.actionResults.length>0?<ul className="list-disc pl-5">{reply.actionResults.map((a,i)=><li key={i}><span className="font-mono">{a.name}</span> — {a.status}: {a.detail}</li>)}</ul>:<p>No Office action was carried out.</p>}
 </div>;
}
export function ClaudeBuildPanel() {
 const session=useOwnerSession();
 const build=useServerFn(claudeBuildOperation);
 const askElsie=useServerFn(managerChat);
 const [handoff,setHandoff]=useState<ManagerReply|null>(null);
 const [request,setRequest]=useState('');
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState<ClaudeBuildResult|null>(null);
 const [models,setModels]=useState<ClaudeModel[]>([]);
 const [model,setModel]=useState('');
 const [answer,setAnswer]=useState('');
 const [connection,setConnection]=useState('Connection has not been checked.');
 const buildInFlight=useRef(false);
 const activeBuild=result?.runs?.find(item=>['queued','in_progress','waiting','pending','requested'].includes(item.state));
 const hasActiveBuild=!!activeBuild;
 useEffect(()=>{
  if(!hasActiveBuild||!session.stepUpComplete||!session.accessToken) return;
  let cancelled=false;
  const interval=setInterval(async()=>{
   if(buildInFlight.current) return;
   buildInFlight.current=true;
   setBusy(true);
   try {
    // Status only: never include a request or retry a paid dispatch.
    const next=await build({data:{accessToken:session.accessToken!}});
    if(!cancelled) setResult(next);
   } catch {
    if(!cancelled) setResult({ok:false,detail:'Automatic status check failed. Use Check Claude builds to check the existing run; do not resend the build.'});
   } finally {buildInFlight.current=false;setBusy(false);}
  },15000);
  return ()=>{cancelled=true;clearInterval(interval);};
 },[hasActiveBuild,session.stepUpComplete,session.accessToken,build]);
 async function run(submit:boolean) {
  if(buildInFlight.current||(submit&&hasActiveBuild)) return;
  buildInFlight.current=true;
  setBusy(true);
  try {setResult(await build({data:{accessToken:session.accessToken??'',...(submit?{request}:{})}}));}
  catch {setResult({ok:false,detail:'Could not confirm the build service. Check status before resubmitting.'});}
  finally {buildInFlight.current=false;setBusy(false);}
 }
 async function chat(check:boolean) {
  setBusy(true);setAnswer('');
  try {
   const reply=await invokeOfficeClaude(check?{action:'models'}:{prompt:request,model});
   if(check) {setModels(reply.models??[]);setConnection(reply.ok?'Claude API connection checked. Choose a model for coding advice.':reply.detail??'Connection check failed.');}
   else setAnswer(reply.ok?`${reply.text??''}${reply.complete?'':'\n\nThis response is incomplete.'}`:reply.detail??'Claude did not answer.');
  } finally {setBusy(false);}
 }
 async function handToElsie() {
  if(buildInFlight.current) return;
  buildInFlight.current=true;setBusy(true);setHandoff(null);
  try {setHandoff(await askElsie({data:{accessToken:session.accessToken??'',messages:[{role:'user',content:request.trim()}],currentRoute:'/build-testing',buildId:currentBuildVersion()}}));}
  catch {setHandoff({ok:false,code:'provider_error',provider:'none',state:'configured_unverified',model:null,text:'',detail:'The handoff could not be confirmed. Check the Work Board and Build & Testing before asking again.',toolCalls:[],actionResults:[]} as ManagerReply);}
  finally {buildInFlight.current=false;setBusy(false);}
 }
 const locked=busy||!session.stepUpComplete;
 return <section aria-label="Claude builds" className="space-y-3 rounded-xl border bg-card p-5">
  <h2 className="text-lg font-semibold">Build with Claude</h2>
  <p>Claude works on the same Office repository as Codex. A build prepares a draft change with typecheck, test and build evidence. Checked, completed changes follow the Office release process.</p>
  <label className="block" htmlFor="claude-build-request">What should Claude build or fix?</label>
  <textarea id="claude-build-request" className="min-h-28 w-full rounded border bg-background p-3" value={request} maxLength={6000} onChange={e=>setRequest(e.target.value)}/>
  <div className="flex flex-wrap gap-2">
   <Button disabled={locked||hasActiveBuild||request.trim().length<10} onClick={()=>void run(true)}>Send build to Claude</Button>
   <Button variant="outline" disabled={locked} onClick={()=>void run(false)}>Check Claude builds</Button>
  </div>
  {!session.stepUpComplete&&<p>Complete owner verification to use Claude.</p>}
  <p role="status">{busy?'Contacting Claude…':result?.detail??'Build connection has not been checked. A Pro subscription alone does not connect the build runner.'}</p>
  {activeBuild&&<p role="status" className="flex items-center gap-2"><span aria-hidden="true" className="inline-block h-4 w-4 animate-spin motion-reduce:animate-none rounded-full border-2 border-current border-t-transparent"/>{activeBuild.state==='in_progress'?'Claude build is running.':'Claude build is queued or waiting.'} Status refreshes every 15 seconds while this panel is open.</p>}
  {result?.runs?.map(item=><p key={item.id}><a className="underline" href={item.url} target="_blank" rel="noreferrer">Claude build {item.id}</a> — {item.state}. {item.title}</p>)}
  <details><summary className="cursor-pointer font-medium">Hand this request to Elsie (Office actions)</summary>
   <div className="mt-3 space-y-3">
    <p className="text-sm">Elsie runs the request through her owner-verified Office actions (tasks, room reads, builder status, builds). Results come back here. This is an Elsie handoff — Claude does not run Office tools itself. A build goes to Claude only if your request names Claude; otherwise Codex. Uses Elsie's office AI budget unless it is a plain status check.</p>
    <Button variant="outline" disabled={locked||request.trim().length<10} onClick={()=>void handToElsie()}>Hand to Elsie</Button>
    {handoff&&<ElsieHandoffResult reply={handoff}/>}
   </div>
  </details>
  <details><summary className="cursor-pointer font-medium">Ask Claude for coding advice</summary>
   <div className="mt-3 space-y-3">
    <p className="text-sm">Advice uses the secure office API connection. It receives the text above; it has no file-editing tools. API charges are separate from Claude Pro.</p>
    <Button variant="outline" disabled={locked} onClick={()=>void chat(true)}>Check Claude API connection</Button>
    <p>{connection}</p>
    {models.length>0&&<label className="block">Claude model <select aria-label="Claude model" className="ml-2 rounded border bg-background p-2" value={model} onChange={e=>setModel(e.target.value)}><option value="">Choose a model</option>{models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
    <Button disabled={locked||!model||request.trim().length<10} onClick={()=>void chat(false)}>Ask Claude — uses office AI budget</Button>
    {answer&&<pre className="whitespace-pre-wrap rounded border p-3 text-sm">{answer}</pre>}
   </div>
  </details>
 </section>;
}

