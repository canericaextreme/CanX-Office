import { createServerFn } from '@tanstack/react-start';
import { FILE_BUCKET, validateOfficeFile, type OfficeFile } from './office-files';
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
 const {db,owner} = await client(data.accessToken,data.room); const path = `${owner.userId}/${data.content_hash}/original`;
 const {data: objects,error} = await db.storage.from(FILE_BUCKET).list(`${owner.userId}/${data.content_hash}`,{limit:10});
 const object = objects?.find(f=>f.name==='original');
 if(error || !object || Number(object.metadata?.size)!==data.size_bytes) throw new Error('Original file upload was not verified. Retry the same file.');
 const {data: row,error: saveError} = await db.from('office_files').upsert({owner_id:owner.userId,filename:data.filename,room:data.room,folder:data.folder,object_path:path,content_hash:data.content_hash,size_bytes:data.size_bytes,mime_type:data.mime_type},{onConflict:'owner_id,content_hash,room,folder'}).select().single();
 if(saveError || !row) throw new Error('Original uploaded, but filing was not confirmed. Retry the same file.');
 return row as OfficeFile;
});
export const listOfficeFiles = createServerFn({method:'POST'}).inputValidator((v:{accessToken:string;room?:string})=>({accessToken:token(v.accessToken),room:v.room})).handler(async({data})=>{
 const {db} = await client(data.accessToken,data.room); let query = db.from('office_files').select('*').order('created_at',{ascending:false}).limit(200);
 if(data.room && data.room!=='brain') query=query.eq('room',data.room);
 const {data: rows,error}=await query; if(error) throw new Error('Saved files could not be loaded.'); return (rows??[]) as OfficeFile[];
});
export const openOfficeFile = createServerFn({method:'POST'}).inputValidator((v:{accessToken:string;id:string})=>({accessToken:token(v.accessToken),id:v.id})).handler(async({data})=>{
 const {db}=await client(data.accessToken); const {data:row,error}=await db.from('office_files').select('object_path,room,filename').eq('id',data.id).single();
 if(error || !row) throw new Error('File unavailable.'); await client(data.accessToken,row.room);
 const {data:signed,error:signError}=await db.storage.from(FILE_BUCKET).createSignedUrl(row.object_path,60,{download:row.filename});
 if(signError || !signed) throw new Error('File could not be opened.'); return signed.signedUrl;
});
export const officeUploadConnection = createServerFn({method:'POST'}).inputValidator((v:{accessToken:string})=>({accessToken:token(v.accessToken)})).handler(async({data})=>{
 await client(data.accessToken); const b=await import('./canx-backend.server'); const c=b.readBackendConfig()!; return {url:c.url,key:c.publishableKey};
});
