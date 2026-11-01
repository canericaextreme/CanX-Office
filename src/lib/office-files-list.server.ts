import type { SupabaseClient } from '@supabase/supabase-js';
import type { OfficeFile } from './office-files';

/** Read-only list assembly after the caller verifies the existing room access. */
export async function readOfficeFileList(db: SupabaseClient, room?: string): Promise<OfficeFile[]> {
 let query = db.from('office_files').select('*').order('created_at',{ascending:false}).limit(200);
 if(room && room!=='brain') query=query.eq('room',room);
 const {data: rows,error}=await query; if(error) throw new Error('Saved files could not be loaded.'); let linksQuery=db.from('office_links').select('*').order('created_at',{ascending:false}).limit(200);
 if(room && room!=='brain') linksQuery=linksQuery.eq('room',room);
 const {data:links,error:linkError}=await linksQuery; if(linkError) throw new Error('Saved links could not be loaded.');
 const combined = [...(rows??[]),...(links??[]).map(link=>({...link,filename:link.title,source_url:link.url,size_bytes:0,object_path:'',content_hash:'',mime_type:'text/uri-list'}))].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||a.id.localeCompare(b.id)) as OfficeFile[];
 // Research must retain the fetched links even when uploaded files fill the combined window.
 return room==='research' ? combined : combined.slice(0,200);
}
