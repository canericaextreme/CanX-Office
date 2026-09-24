import { createServerFn } from '@tanstack/react-start';
import type { KnowledgeDocument } from './document-knowledge';
const token=(v:unknown)=>typeof v==='string'?v.slice(0,4000):'';
export const listKnowledgeDocuments=createServerFn({method:'POST'}).inputValidator((v:{accessToken?:string})=>({accessToken:token(v?.accessToken)})).handler(async({data})=>{
 const b=await import('./canx-backend.server'); const c=b.readBackendConfig(); const owner=await b.verifySignedIn(data.accessToken);
 if(!owner.ok || !c) return {ok:false,message:owner.ok?'Database unavailable':owner.message,documents:[] as KnowledgeDocument[]};
 const r=await b.restRequest(c,data.accessToken,'knowledge_documents?select=id,title,project,filename,content_hash,character_count,chunk_count,created_at&order=created_at.desc&limit=100');
 return {ok:r.ok,message:r.ok?'':'Documents could not be read.',documents:r.ok&&Array.isArray(r.body)?r.body as KnowledgeDocument[]:[]};
});
export const importKnowledgeDocument=createServerFn({method:'POST'}).inputValidator((v:{accessToken:string;title:string;project:string;filename:string;text:string})=>{
 if(typeof v?.text!=='string'||!v.text.trim()||v.text.length>2000000) throw new Error('Choose a text document with up to 2 million characters. No text was saved.');
 for(const [key,max] of [['title',300],['project',160],['filename',300]] as const) if(typeof v[key]!=='string'||v[key].length>max) throw new Error('Invalid document name.');
 return {...v,accessToken:token(v.accessToken)};
}).handler(async({data})=>{
 const b=await import('./canx-backend.server');const c=b.readBackendConfig();const owner=await b.verifyOwner(data.accessToken);
 if(!owner.ok||!c) return {ok:false,message:owner.ok?'Database unavailable':owner.message};
 const r=await b.restRequest(c,data.accessToken,'rpc/import_knowledge_document',{method:'POST',body:JSON.stringify({p_title:data.title,p_project:data.project,p_filename:data.filename,p_text:data.text})});
 const row=r.body as KnowledgeDocument & {verified?:boolean};
 if(!r.ok||!row?.verified) return {ok:false,message:'Import was not confirmed. Retry the same file; identical imports are deduplicated.'};
 return {ok:true,message:`Saved and verified ${row.character_count.toLocaleString()} characters in ${row.chunk_count} sections. Document ${row.id}. The original file is unchanged.`};
});
