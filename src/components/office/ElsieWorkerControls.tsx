import {useEffect,useRef,useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {ownerWorkerAction,type WorkerOwnerStatus,type OwnerWorkerInput} from '@/lib/elsie-worker-owner.functions';
import {useOwnerSession} from '@/lib/owner-session';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';

/** Owner enrollment and stop are separate from server provisioning/activation. */
export function ElsieWorkerControls(){
 const owner=useOwnerSession(),call=useServerFn(ownerWorkerAction);
 const [status,setStatus]=useState<WorkerOwnerStatus|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<string[]>([]),[hours,setHours]=useState(1),[cents,setCents]=useState(0),[confirm,setConfirm]=useState(false);
 const currentToken=useRef(owner.accessToken);currentToken.current=owner.accessToken;
 useEffect(()=>{setStatus(null);setSelected([]);setConfirm(false);},[owner.accessToken,owner.stepUpComplete]);
 const invoke=async(data:OwnerWorkerInput)=>{
  const token=owner.accessToken;setBusy(true);try{const r=await call({data});if(currentToken.current!==token)return null;setNotice(r.detail);if(r.status){setStatus(r.status);setSelected(old=>old.filter(id=>r.status!.eligible.some(t=>t.id===id)));}return r;}
  catch{setNotice('Request unconfirmed. Refresh status before trying again.');return null;}finally{setBusy(false);}
 };
 const refresh=()=>invoke({action:'status',accessToken:owner.accessToken??''});
 return <section aria-label="Elsie unattended work controls" className="space-y-3 rounded-xl border p-4">
  <h2 className="text-lg font-semibold">Elsie unattended work</h2>
  <p className="text-sm">Authorize exact queued tasks for a limited period, or stop an existing enrollment. Server activation and all protected release gates remain separate.</p>
  {!owner.stepUpComplete&&<p role="status">Verify your authenticator using Account before changing worker authorization.</p>}
  <Button disabled={busy||!owner.stepUpComplete} onClick={()=>void refresh()}>Read worker status</Button>
  {notice&&<p role="status">{notice}</p>}
  {status&&owner.stepUpComplete&&<>
   <ul className="space-y-2">{status.sessions.map(s=><li key={s.id} className="flex flex-wrap items-center gap-2">
    <span>{s.stopped_at?'Stopped':Date.parse(s.expires_at)<=Date.now()?'Expired':'Authorized'} · until {new Date(s.expires_at).toLocaleString()} · US${(s.max_cents/100).toFixed(2)} maximum</span>
    {!s.stopped_at&&<Button variant="destructive" disabled={busy||!owner.stepUpComplete} onClick={()=>void invoke({action:'stop',accessToken:owner.accessToken??'',sessionId:s.id}).then(()=>refresh())}>Stop this enrollment</Button>}
   </li>)}</ul>
   <fieldset className="space-y-2"><legend className="font-semibold">Existing queued tasks</legend>
    {status.eligible.length===0&&<p>No eligible queued tasks. Nothing will be invented or assigned here.</p>}
    {status.eligible.map(t=><label key={t.id} className="flex items-center gap-2"><input type="checkbox" checked={selected.includes(t.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,t.id]:old.filter(x=>x!==t.id))}/>{t.worker} · {t.title}</label>)}
   </fieldset>
   <div className="flex flex-wrap gap-3">
    <label>Hours (maximum 10)<input aria-label="Worker authorization hours" className="ml-2 w-20 rounded border p-2" type="number" min="0.1" max="10" step="0.1" value={hours} onChange={e=>setHours(Number(e.target.value))}/></label>
    <label>Maximum spend (USD cents)<input aria-label="Worker spending ceiling in USD cents" className="ml-2 w-24 rounded border p-2" type="number" min="0" max="10000" value={cents} onChange={e=>setCents(Number(e.target.value))}/></label>
   </div>
   <Button disabled={busy||!owner.stepUpComplete||selected.length===0||selected.length>6||!Number.isFinite(hours)||hours<=0||hours>10||!Number.isSafeInteger(cents)||cents<0||cents>10000} onClick={()=>setConfirm(true)}>Review authorization</Button>
  </>}
  <Dialog open={confirm} onOpenChange={setConfirm}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>John — review worker authorization</DialogTitle><DialogDescription>Authorize only the selected tasks for {hours} hours, with a total ceiling of US${(cents/100).toFixed(2)}. This does not authorize protected changes, merge, publication, or new subscriptions.</DialogDescription></DialogHeader>
   <ul>{status?.eligible.filter(t=>selected.includes(t.id)).map(t=><li key={t.id}>{t.worker} · {t.title}</li>)}</ul>
   <Button disabled={busy||!owner.stepUpComplete} onClick={()=>{setConfirm(false);void invoke({action:'enroll',accessToken:owner.accessToken??'',expires:new Date(Date.now()+hours*3600_000).toISOString(),maxCents:cents,tasks:selected}).then(()=>refresh());}}>Authorize these tasks</Button>
   <Button variant="outline" onClick={()=>setConfirm(false)}>Cancel</Button>
  </DialogContent></Dialog>
 </section>;
}
