import { createFileRoute } from "@tanstack/react-router";
import { useEffect,useState } from "react";
import { useOwnerSession } from "@/lib/owner-session";
import { getOfficeConsent,decideOfficeConsent } from "@/lib/office-mcp-consent.functions";
import type { ConsentDetails } from "@/lib/office-mcp-consent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";

export const Route=createFileRoute("/_office/oauth/consent")({
  validateSearch:(search:Record<string,unknown>)=>({authorization_id:typeof search["authorization_id"]==="string" && /^[A-Za-z0-9_-]{1,200}$/.test(search["authorization_id"]) ? search["authorization_id"] : ""}),
  component:OfficeConsent,
});
function OfficeConsent() {
  const {authorization_id}=Route.useSearch();
  const session=useOwnerSession();
  const [details,setDetails]=useState<ConsentDetails|null>(null);
  const [message,setMessage]=useState("");
  const [identity,setIdentity]=useState<"chatgpt"|"claude">("chatgpt");
  const [code,setCode]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    setDetails(null);
    if(!authorization_id || !session.accessToken || !session.stepUpComplete)return;
    let current=true;
    getOfficeConsent({data:{accessToken:session.accessToken,authorizationId:authorization_id}}).then(r=>{
      if(current){if(r.ok){setDetails(r.details);setMessage("");}else setMessage(r.message);}
    }).catch(()=>{if(current)setMessage("The Office could not verify this request. Try the connection again.");});
    return()=>{current=false;};
  },[authorization_id,session.accessToken,session.stepUpComplete]);
  async function decide(approve:boolean) {
    if(!session.accessToken || !details || busy)return;
    setBusy(true);setMessage("");
    try {
      const r=await decideOfficeConsent({data:{accessToken:session.accessToken,authorizationId:authorization_id,identity,approve}});
      if(r.ok)window.location.assign(r.redirect);else setMessage(r.message);
    }catch{setMessage("Authorization could not be completed. Try the connection again.");}
    finally{setBusy(false);}
  }
  async function confirmAuthenticator() {
    if(busy)return;
    setBusy(true);setMessage("");
    try {
      const error=await session.submitMfaCode(code);
      if(error)setMessage(error);else setCode("");
    }catch{setMessage("The authenticator could not be checked. Try again.");}
    finally{setBusy(false);}
  }
  return <div className="mx-auto max-w-xl p-6"><Card><CardHeader><CardTitle>Authorize Office access</CardTitle></CardHeader><CardContent className="space-y-4">
    {!authorization_id?<p>Start this connection from ChatGPT or Claude to open a valid authorization request.</p>:!session.stepUpComplete?<form className="space-y-3" onSubmit={e=>{e.preventDefault();void confirmAuthenticator();}}>
      <p>Confirm your authenticator once to authorize this connection.</p>
      <Input aria-label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} />
      <Button disabled={busy || !code} type="submit">Confirm</Button>
    </form>:!details?<p>Verifying the connection request…</p>:<>
      <p><strong>{details.client.name}</strong> is requesting renewable Office access.</p>
      <p className="text-sm text-muted-foreground break-all">Registered return address: {details.redirect_uri}</p>
      <p>Permission: read saved operational project and task metadata, plus the shared setup checklist. Private records and build submission are excluded from this first connection.</p>
      <p className="text-sm text-muted-foreground">Identity information requested: {details.scope || "none"}. These identity scopes do not expand Office permissions.</p>
      <label className="block text-sm">Which assistant are you connecting?
        <select className="mt-2 block w-full rounded border bg-background p-2" value={identity} onChange={e=>setIdentity(e.target.value as "chatgpt"|"claude")}>
          <option value="chatgpt">ChatGPT</option><option value="claude">Claude</option>
        </select>
      </label>
      <div className="flex gap-3"><Button disabled={busy} onClick={()=>void decide(true)}>Approve this connection</Button><Button variant="outline" disabled={busy} onClick={()=>void decide(false)}>Deny</Button></div>
    </>}
    {message&&<p role="alert" className="text-sm">{message}</p>}
  </CardContent></Card></div>;
}
