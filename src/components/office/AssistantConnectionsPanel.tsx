import { useEffect,useState } from 'react';
import { useOwnerSession } from '@/lib/owner-session';
import { readAssistantConnections,revokeAssistantConnection,type AssistantConnection } from '@/lib/office-assistant-connections.functions';
import { Card,CardContent,CardHeader,CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
export function AssistantConnectionsPanel(){
  const session=useOwnerSession();
  const [rows,setRows]=useState<AssistantConnection[]|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  async function refresh(){
    if(!session.accessToken||session.viewer)return;
    setBusy(true);
    try{const r=await readAssistantConnections({data:{accessToken:session.accessToken}});if(r.ok){setRows(r.connections);setNotice('');}else{setRows(null);setNotice(r.message);}}
    catch{setRows(null);setNotice('Connection status could not be read.');}finally{setBusy(false);}
  }
  useEffect(()=>{void refresh();},[session.accessToken,session.viewer]);
  async function revoke(clientId:string){
    if(!session.accessToken||busy)return;
    setBusy(true);
    try{const r=await revokeAssistantConnection({data:{accessToken:session.accessToken,clientId}});if(r.ok){await refresh();setNotice(r.message);}else setNotice(r.message);}
    catch{setNotice('The connection could not be switched off.');}finally{setBusy(false);}
  }
  if(session.viewer)return null;
  return <Card><CardHeader><CardTitle>Assistant sign-in connections</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm text-muted-foreground">Separate assistant identities keep your authenticator from cancelling their sessions. Room viewing permissions are managed below. A connected session does not verify a room read or picture capture.</p>
    {(['chatgpt','claude'] as const).map(identity=>{
      const connections=rows?.filter(r=>r.identity===identity);
      return <div key={identity} className="rounded border p-3 space-y-2"><strong>{identity==='chatgpt'?'ChatGPT':'Claude'}</strong>
        {rows===null?<p>Status unavailable</p>:connections?.length===0?<p>Needs connection</p>:connections?.map(r=><div key={r.client_id} className="flex flex-wrap items-center justify-between gap-2">
          <p>{!r.enabled?'Access off':!r.connected?'Needs reconnect':r.isolated?'Connected — separate identity':'Connected — owner-linked'}{r.enabled&&!r.isolated?' · Reconnect to finish isolation':''}</p>
          <Button variant="outline" disabled={busy||!r.enabled} onClick={()=>void revoke(r.client_id)}>Switch this connection off</Button>
        </div>)}
      </div>;
    })}
    <Button variant="outline" disabled={busy} onClick={()=>void refresh()}>Refresh connection status</Button>
    {notice&&<p role="status">{notice}</p>}
  </CardContent></Card>;
}
