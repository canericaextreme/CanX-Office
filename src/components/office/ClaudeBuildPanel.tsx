import {useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {useOwnerSession} from '@/lib/owner-session';
import {claudeBuildOperation} from '@/lib/claude-builds.functions';
import type {ClaudeBuildResult} from '@/lib/claude-builds.server';
import {invokeOfficeClaude,type ClaudeModel} from '@/lib/claude-chat';
import {Button} from '@/components/ui/button';
export function ClaudeBuildPanel() {
 const session=useOwnerSession();
 const build=useServerFn(claudeBuildOperation);
 const [request,setRequest]=useState('');
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState<ClaudeBuildResult|null>(null);
 const [models,setModels]=useState<ClaudeModel[]>([]);
 const [model,setModel]=useState('');
 const [answer,setAnswer]=useState('');
 const [connection,setConnection]=useState('Connection has not been checked.');
 async function run(submit:boolean) {
  setBusy(true);
  try {setResult(await build({data:{accessToken:session.accessToken??'',...(submit?{request}:{})}}));}
  catch {setResult({ok:false,detail:'Could not confirm the build service. Check status before resubmitting.'});}
  finally {setBusy(false);}
 }
 async function chat(check:boolean) {
  setBusy(true);setAnswer('');
  try {
   const reply=await invokeOfficeClaude(check?{action:'models'}:{prompt:request,model});
   if(check) {setModels(reply.models??[]);setConnection(reply.ok?'Claude API connection checked. Choose a model for coding advice.':reply.detail??'Connection check failed.');}
   else setAnswer(reply.ok?`${reply.text??''}${reply.complete?'':'\n\nThis response is incomplete.'}`:reply.detail??'Claude did not answer.');
  } finally {setBusy(false);}
 }
 const locked=busy||!session.stepUpComplete;
 return <section aria-label="Claude builds" className="space-y-3 rounded-xl border bg-card p-5">
  <h2 className="text-lg font-semibold">Build with Claude</h2>
  <p>Claude works on the same Office repository as Codex. A build prepares a draft change with typecheck, test and build evidence. Checked, completed changes follow the Office release process.</p>
  <label className="block" htmlFor="claude-build-request">What should Claude build or fix?</label>
  <textarea id="claude-build-request" className="min-h-28 w-full rounded border bg-background p-3" value={request} maxLength={6000} onChange={e=>setRequest(e.target.value)}/>
  <div className="flex flex-wrap gap-2">
   <Button disabled={locked||request.trim().length<10} onClick={()=>void run(true)}>Send build to Claude</Button>
   <Button variant="outline" disabled={locked} onClick={()=>void run(false)}>Check Claude builds</Button>
  </div>
  {!session.stepUpComplete&&<p>Complete owner verification to use Claude.</p>}
  <p role="status">{busy?'Contacting Claude…':result?.detail??'Build connection has not been checked. A Pro subscription alone does not connect the build runner.'}</p>
  {result?.runs?.map(item=><p key={item.id}><a className="underline" href={item.url} target="_blank" rel="noreferrer">Claude build {item.id}</a> — {item.state}. {item.title}</p>)}
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
