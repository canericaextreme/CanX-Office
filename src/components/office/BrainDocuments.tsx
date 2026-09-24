import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useOwnerSession } from '@/lib/owner-session';
import { listKnowledgeDocuments, importKnowledgeDocument } from '@/lib/document-knowledge.functions';
import { sendManagerHandoff } from '@/lib/companion-bridge';
import type { KnowledgeDocument } from '@/lib/document-knowledge';

export function BrainDocuments(){
 const session=useOwnerSession(); const read=useServerFn(listKnowledgeDocuments); const save=useServerFn(importKnowledgeDocument);
 const [docs,setDocs]=useState<KnowledgeDocument[]>([]); const [status,setStatus]=useState('');const [busy,setBusy]=useState(false);const [project,setProject]=useState('');const [refresh,setRefresh]=useState(0);
 useEffect(()=>{let active=true;setDocs([]);if(!session.accessToken)return;
  void read({data:{accessToken:session.accessToken}}).then(r=>{if(active){setDocs(r.documents);setStatus(r.message);}}).catch(()=>{if(active)setStatus('Documents could not be read.');});return()=>{active=false;};
 },[session.accessToken,read,refresh]);
 const upload=async(file:File)=>{
  if(!session.accessToken||busy)return;setBusy(true);setStatus('Reading the document…');
  try{
   if(file.size>8*1024*1024)throw new Error('Choose a file under 8 MB. Nothing was saved.');
   let text='';
   if(/\.docx$/i.test(file.name)){
    const mammoth=await import('mammoth'); const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});text=result.value;
   }else if(/\.(txt|md)$/i.test(file.name))text=await file.text();
   else throw new Error('Choose a Word DOCX, TXT or Markdown file. Scanned files need text extraction first.');
   if(!text.trim()||text.length>2000000)throw new Error('No readable text, or more than 2 million characters. Nothing was saved.');
   setStatus('Saving the complete extracted text and verifying every section…');
   const result=await save({data:{accessToken:session.accessToken,title:file.name.replace(/\.[^.]+$/,''),filename:file.name,project,text}});
   setStatus(result.message);if(result.ok)setRefresh(n=>n+1);
  }catch(e){setStatus(e instanceof Error?e.message:'Import was not confirmed. Retry the same file.');}finally{setBusy(false);}
 };
 return <section className="rounded-xl border border-border bg-card p-5 space-y-3">
  <h2 className="text-lg font-semibold">Project documents</h2>
  <p>Save complete document text for Astra to search after reconnecting. Each changed file is a separate version. Keep your original file for pictures and formatting.</p>
  <label className="block">Project <input className="ml-2 rounded border p-2 bg-background" value={project} maxLength={160} onChange={e=>setProject(e.target.value)} placeholder="Book or project name"/></label>
  <label className="block">Import document <input className="block mt-2" type="file" accept=".docx,.txt,.md" disabled={busy||!session.stepUpComplete} onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.target.value='';}}/></label>
  {!session.stepUpComplete&&<p>Complete owner verification to import documents.</p>}
  <p role="status">{status}</p>
  <p className="text-sm">Up to 8 MB and 2 million extracted characters per file. Text only; pictures, layout and scanned text are not imported.</p>
  {docs.map(d=><article key={d.id} className="border-t pt-3 space-y-1">
   <h3 className="font-semibold">{d.title}</h3><p>{d.project} · {d.character_count.toLocaleString()} characters · {d.chunk_count} sections · {new Date(d.created_at).toLocaleString()}</p>
   <p className="text-sm">Version {d.content_hash.slice(0,12)}</p>
   <button className="rounded border px-3 py-2" onClick={()=>sendManagerHandoff({text:`Use document ${d.id} (${d.title}, version ${d.content_hash}). Read the whole document and tell me what source coverage you received.`,room:'Brain',path:'/brain'})}>Read with Astra</button>
  </article>)}
 </section>;
}
