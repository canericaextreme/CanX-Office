import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useOwnerSession } from '@/lib/owner-session';
import { FILE_BUCKET, FILE_FOLDERS, FILE_ROOMS, MAX_FILE_BYTES, type OfficeFile } from '@/lib/office-files';
import { prepareOfficeUpload, finishOfficeUpload, listOfficeFiles, openOfficeFile, officeUploadConnection } from '@/lib/office-files.functions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
export function OfficeFiles({room='brain',compact=false,onSaved}:{room?:string;compact?:boolean;onSaved?:(file:OfficeFile)=>void}) {
 const session=useOwnerSession(); const prepare=useServerFn(prepareOfficeUpload); const finish=useServerFn(finishOfficeUpload); const list=useServerFn(listOfficeFiles); const openFile=useServerFn(openOfficeFile); const connection=useServerFn(officeUploadConnection);
 const [destination,setDestination]=useState(room); const [folder,setFolder]=useState(room==='finance'?'Finance':room==='family-continuity'?'Family and Legacy':'CanX Projects'); const [files,setFiles]=useState<OfficeFile[]>([]); const [selected,setSelected]=useState<File[]>([]); const [status,setStatus]=useState(''); const [busy,setBusy]=useState(false); const [show,setShow]=useState(false); const [refresh,setRefresh]=useState(0); const activeToken=useRef(session.accessToken); activeToken.current=session.accessToken;
 useEffect(()=>{setDestination(room);},[room]);
 useEffect(()=>{let active=true;setFiles([]); if(session.accessToken && (!compact||show)) void list({data:{accessToken:session.accessToken,room:compact?destination:room}}).then(rows=>{if(active)setFiles(rows);}).catch(e=>{if(active)setStatus(e instanceof Error?e.message:'Files unavailable.');}); return()=>{active=false;};},[session.accessToken,list,room,destination,compact,show,refresh]);
 async function upload(){const accessToken=session.accessToken;if(!accessToken||busy)return;setBusy(true);let saved=0;
  try {const config=await connection({data:{accessToken}});const {createClient}=await import('@supabase/supabase-js');const db=createClient(config.url,config.key,{global:{headers:{Authorization:`Bearer ${accessToken}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   for(const file of selected){if(activeToken.current!==accessToken)throw new Error('Sign-in changed. Sign in again to continue.');if(!file.size||file.size>MAX_FILE_BYTES)throw new Error(`${file.name}: choose a file up to 25 MB.`);setStatus(`Saving ${file.name}…`);
    const buffer=await file.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',buffer);const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
    const input={accessToken,filename:file.name,room:destination,folder,size_bytes:file.size,content_hash:hash,mime_type:file.type||'application/octet-stream'};
    const prepared=await prepare({data:input});if(prepared.uploadToken){const {error}=await db.storage.from(FILE_BUCKET).uploadToSignedUrl(prepared.path,prepared.uploadToken,file,{contentType:input.mime_type});if(error)throw new Error(`${file.name}: upload failed. Retry the same file.`);}
    const record=await finish({data:input});saved++;onSaved?.(record);setSelected(current=>current.filter(f=>f!==file));setRefresh(n=>n+1);
   }setStatus(`Saved ${saved} file${saved===1?'':'s'} in ${FILE_ROOMS.find(r=>r.id===destination)?.label} → ${folder}. Private to your owner account.`);
  }catch(e){setStatus(`${saved?`${saved} file(s) saved. `:''}${e instanceof Error?e.message:'Save was not confirmed.'}`);}finally{setBusy(false);}
 }
 async function download(file:OfficeFile){if(!session.accessToken)return;try{const url=await openFile({data:{accessToken:session.accessToken,id:file.id}});window.location.assign(url);}catch(e){setStatus(e instanceof Error?e.message:'File unavailable.');}}
 const savedList=<div className="space-y-3">{files.length===200&&<p className="text-sm">Showing the 200 most recent files.</p>}{files.map(f=><div key={f.id} className="flex items-center justify-between gap-3 rounded border border-border p-3"><div className="min-w-0"><p className="break-words font-medium">{f.filename}</p><p className="text-sm text-muted-foreground">{FILE_ROOMS.find(r=>r.id===f.room)?.label} · {f.folder} · {(f.size_bytes/1024/1024).toFixed(1)} MB</p></div><Button variant="outline" size="sm" onClick={()=>void download(f)}>Open file</Button></div>)}</div>;
 return <section className={compact?'':'mb-5 rounded-xl border border-border bg-card p-4 space-y-3'}>
  <Dialog open={show} onOpenChange={setShow}><DialogTrigger asChild><Button variant="outline" size="sm"><Plus className="h-4 w-4"/> Add files or photos</Button></DialogTrigger>
   <DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Add files, photos or videos</DialogTitle></DialogHeader>
    <label className="text-sm">File in room<select className="mt-1 w-full rounded border bg-background p-2" disabled={busy} value={destination} onChange={e=>setDestination(e.target.value)}>{FILE_ROOMS.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
    <label className="text-sm">Folder<select className="mt-1 w-full rounded border bg-background p-2" disabled={busy} value={folder} onChange={e=>setFolder(e.target.value)}>{FILE_FOLDERS.map(f=><option key={f}>{f}</option>)}</select></label>
    <input aria-label="Choose files, photos or videos" type="file" multiple disabled={busy||!session.accessToken} onChange={e=>{setSelected(Array.from(e.target.files??[]));e.target.value='';}}/>
    <p className="text-sm">Original files stay intact and private. Up to 25 MB per file. Saving does not share a file or ask Elsie to analyze it.</p>
    {destination==='approvals'&&<p className="text-sm">These are supporting files. Saving does not create or approve a decision request.</p>}
    {selected.map((f,i)=><p key={`${f.name}-${i}`} className="text-sm break-words">{f.name}</p>)}
    <Button disabled={busy||!selected.length||!session.accessToken} onClick={()=>void upload()}>{busy?'Saving…':'Save selected files'}</Button><p role="status" className="text-sm">{status}</p>{compact&&savedList}
   </DialogContent></Dialog>
  {!compact&&<><p role="status" className="text-sm">{status}</p>{savedList}</>}
 </section>;
}
