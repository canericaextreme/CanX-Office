import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { openOfficeFile } from '@/lib/office-files.functions';
import { type OfficeFile } from '@/lib/office-files';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Preview = { kind: 'text'; text: string } | { kind: 'image' | 'pdf' | 'audio' | 'video'; url: string } | { kind: 'unsupported' };
export function OfficeFilePreview({file,accessToken,onClose,onDownload}:{file:OfficeFile|null;accessToken:string|null|undefined;onClose:()=>void;onDownload:(file:OfficeFile)=>void}) {
 const open=useServerFn(openOfficeFile); const [preview,setPreview]=useState<Preview|null>(null); const [error,setError]=useState('');
 useEffect(()=>{if(!file||!accessToken)return;let active=true;let objectUrl='';const controller=new AbortController();setPreview(null);setError('');
  void (async()=>{
   const ext=file.filename.split('.').pop()?.toLowerCase()??'';
   const types:Record<string,{kind:'image'|'pdf'|'audio'|'video';mime:string}>={png:{kind:'image',mime:'image/png'},jpg:{kind:'image',mime:'image/jpeg'},jpeg:{kind:'image',mime:'image/jpeg'},webp:{kind:'image',mime:'image/webp'},gif:{kind:'image',mime:'image/gif'},pdf:{kind:'pdf',mime:'application/pdf'},mp3:{kind:'audio',mime:'audio/mpeg'},wav:{kind:'audio',mime:'audio/wav'},mp4:{kind:'video',mime:'video/mp4'},webm:{kind:'video',mime:'video/webm'}};
   if(!['docx','txt','md','csv'].includes(ext)&&!types[ext]){if(active)setPreview({kind:'unsupported'});return;}
   const url=await open({data:{accessToken,id:file.id,download:false}});const response=await fetch(url,{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw new Error('Preview could not be loaded. Your saved original is still in the Office.');
   const buffer=await response.arrayBuffer();
   if(ext==='docx'){const mammoth=await import('mammoth');const result=await mammoth.extractRawText({arrayBuffer:buffer});if(active)setPreview({kind:'text',text:result.value});}
   else if(['txt','md','csv'].includes(ext)){if(active)setPreview({kind:'text',text:new TextDecoder().decode(buffer)});}
   else {const type=types[ext]!;objectUrl=URL.createObjectURL(new Blob([buffer],{type:type.mime}));if(active)setPreview({kind:type.kind,url:objectUrl});else URL.revokeObjectURL(objectUrl);}
  })().catch(e=>{if(active)setError(e instanceof Error?e.message:'Preview unavailable.');});
  return()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[file,accessToken,open]);
 return <Dialog open={!!file} onOpenChange={value=>{if(!value)onClose();}}><DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle className="break-words pr-6">{file?.filename}</DialogTitle></DialogHeader>
  <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Preview in the Office</p><Button variant="outline" onClick={()=>{if(file)onDownload(file);}}>Download original</Button></div>
  {error?<p role="alert">{error}</p>:!preview?<p role="status">Opening preview…</p>:preview.kind==='text'?<><p className="text-sm text-muted-foreground">Document text. The original keeps its formatting and pictures.</p><div className="whitespace-pre-wrap break-words rounded border border-border p-5 text-base leading-relaxed">{preview.text||'No readable text was found in this document.'}</div></>:preview.kind==='image'?<img src={preview.url} alt={file?.filename} className="max-h-[65dvh] w-full object-contain"/>:preview.kind==='pdf'?<iframe title={file?.filename} src={preview.url} className="h-[65dvh] w-full rounded border"/>:preview.kind==='audio'?<audio controls src={preview.url} className="w-full"/>:preview.kind==='video'?<video controls src={preview.url} className="max-h-[65dvh] w-full"/>:<p>This file type does not have an Office preview yet. Use Download original to open it in its own app.</p>}
 </DialogContent></Dialog>;
}
