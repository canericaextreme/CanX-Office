import { createServerFn } from '@tanstack/react-start';
import { FILE_BUCKET, FILE_ROOMS, FILE_FOLDERS, validateWebLink, validateOfficeFile, type OfficeFile } from './office-files';
const token = (v: unknown) => typeof v === 'string' ? v.slice(0,4000) : '';
async function client(accessToken: string, room?: string) {
 const b = await import('./canx-backend.server'); const config = b.readBackendConfig();
 const owner = room === 'finance' ? await b.verifyOwner(accessToken) : await b.verifySignedIn(accessToken);
 if (!owner.ok) throw new Error(owner.message); if (!config) throw new Error('Database unavailable.');
 const { createClient } = await import('@supabase/supabase-js');
 return { owner, db: createClient(config.url, config.publishableKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) };
}
export const prepareOfficeUpload = createServerFn({method:'POST'}).inputValidator((v: {accessToken:string; filename:string;room:string;folder:string;size_bytes:number;content_hash:string}) => ({...validateOfficeFile(v), accessToken:token(v.accessToken)})).handler(async({data}) => {
 const {db,owner} = await client(data.accessToken,data.room);
 const path = `${owner.userId}/${data.content_hash}/original`;
 const { data: existing, error: lookupError } = await db.storage.from(FILE_BUCKET).list(`${owner.userId}/${data.content_hash}`, {limit:10});
 if (lookupError) throw new Error('File storage could not be checked. Nothing was uploaded.');
 if (existing?.some(f=>f.name === 'original')) return {path, uploadToken: null};
 const {data: signed,error} = await db.storage.from(FILE_BUCKET).createSignedUploadUrl(path);
 if(error || !signed) throw new Error('File storage is unavailable. Nothing was uploaded.');
 return {path,uploadToken:signed.token};
});
export const finishOfficeUpload = createServerFn({method:'POST'}).inputValidator((v: {accessToken:string;filename:string;room:string;folder:string;size_bytes:number;content_hash:string;mime_type:string}) => ({...validateOfficeFile(v), accessToken:token(v.accessToken), mime_type:typeof v.mime_type==='string'?v.mime_type.slice(0,200):'application/octet-stream'})).handler(async({data}) => {
 const {db,owner} = await client(data.accessToken,data.room);
 const {confirmOriginalUpload} = await import('./office-upload.server');
 return confirmOriginalUpload(db, owner.userId, data);
});
export const listOfficeFiles = createServerFn({method:'POST'}).inputValidator((v:{accessToken:string;room?:string})=>({accessToken:token(v.accessToken),room:v.room})).handler(async({data})=>{
 const {db} = await client(data.accessToken,data.room); let query = db.from('office_files').select('*').order('created_at',{ascending:false}).limit(200);
 if(data.room && data.room!=='brain') query=query.eq('room',data.room);
 const {data: rows,error}=await query; if(error) throw new Error('Saved files could not be loaded.'); let linksQuery=db.from('office_links').select('*').order('created_at',{ascending:false}).limit(200);
 if(data.room && data.room!=='brain') linksQuery=linksQuery.eq('room',data.room);
 const {data:links,error:linkError}=await linksQuery; if(linkError) throw new Error('Saved links could not be loaded.');
 return [...(rows??[]),...(links??[]).map(link=>({...link,filename:link.title,source_url:link.url,size_bytes:0,object_path:'',content_hash:'',mime_type:'text/uri-list'}))].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,200) as OfficeFile[];
});
export const openOfficeFile = createServerFn({method:'POST'}).inputValidator((v:{accessToken:string;id:string;download?:boolean})=>({accessToken:token(v.accessToken),id:v.id,download:v.download===true})).handler(async({data})=>{
 const {db}=await client(data.accessToken); const {data:row,error}=await db.from('office_files').select('object_path,room,filename').eq('id',data.id).single();
 if(error || !row) { const {data:link,error:linkError}=await db.from('office_links').select('url,room').eq('id',data.id).single(); if(linkError || !link) throw new Error('File or link unavailable.'); await client(data.accessToken,link.room); return validateWebLink(link.url); } await client(data.accessToken,row.room);
 const {data:signed,error:signError}=await db.storage.from(FILE_BUCKET).createSignedUrl(row.object_path,60,data.download?{download:row.filename}:undefined);
 if(signError || !signed) throw new Error('File could not be opened.'); return signed.signedUrl;
});
export const officeUploadConnection = createServerFn({method:'POST'}).inputValidator((v:{accessToken:string})=>({accessToken:token(v.accessToken)})).handler(async({data})=>{
 await client(data.accessToken); const b=await import('./canx-backend.server'); const c=b.readBackendConfig()!; return {url:c.url,key:c.publishableKey};
});

export const saveOfficeLink=createServerFn({method:'POST'}).inputValidator((v:{accessToken:string;url:string;title:string;room:string;folder:string})=>{
 if(!FILE_ROOMS.some(r=>r.id===v.room)||!FILE_FOLDERS.includes(v.folder)||typeof v.title!=='string'||v.title.length>300) throw new Error('Choose a valid room, folder and title.');
 const url=validateWebLink(v.url); return {...v,url,title:v.title.trim()||new URL(url).hostname,accessToken:token(v.accessToken)};
}).handler(async({data})=>{const {db,owner}=await client(data.accessToken,data.room);const {data:row,error}=await db.from('office_links').upsert({owner_id:owner.userId,url:data.url,title:data.title,room:data.room,folder:data.folder},{onConflict:'owner_id,url,room,folder'}).select().single();if(error||!row)throw new Error('Link save was not confirmed.');return {...row,filename:row.title,source_url:row.url,size_bytes:0,object_path:'',content_hash:'',mime_type:'text/uri-list'} as OfficeFile;});

export const deleteOfficeFile = createServerFn({method:'POST'}).inputValidator((v:{accessToken:string;id:string;kind:'file'|'link'})=>{
 if(!v || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.id) || !['file','link'].includes(v.kind)) throw new Error('Choose a saved file or link to delete.');
 return {accessToken:token(v.accessToken),id:v.id,kind:v.kind};
}).handler(async({data})=>{
 const {db,owner}=await client(data.accessToken);
 const table=data.kind==='link'?'office_links':'office_files';
 const {data:row,error}=await db.from(table).select('id,room').eq('id',data.id).eq('owner_id',owner.userId).single();
 if(error||!row) throw new Error('Saved file or link unavailable. Nothing was deleted.');
 // Check the actual saved room, including Finance step-up, rather than trusting the browser.
 await client(data.accessToken,row.room);
 const {data:deleted,error:deleteError}=await db.from(table).delete().eq('id',data.id).eq('owner_id',owner.userId).select('id').single();
 if(deleteError||!deleted) throw new Error('Deletion was not confirmed. The saved entry is still shown.');
 // A content-addressed original may be shared by other room entries. Removing
 // this entry deliberately leaves that private original and other entries intact.
 return {id:deleted.id};
});
