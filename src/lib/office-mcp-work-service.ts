import { OFFICE_SKILLS, SKILLS_REGISTRY_VERSION } from './office-skills.ts';
export interface OfficeWorkServiceDeps {
 url:string;key:string;serviceKey?:string;fetch:typeof fetch;
}
export async function officeMcpWorkWith(deps:OfficeWorkServiceDeps,token:string,name:string,args:Record<string,unknown>):Promise<unknown>{
 const headers={apikey:deps.key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 const rpc=async(name:string,args:unknown)=>{
  const response=await deps.fetch(`${deps.url}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Office work unavailable');return response.json();
 };
 if(await rpc('canx_mcp_work_active',{})!==true)throw Error('Office working grant required');
 switch(name){
 case 'read_office_records':return rpc('canx_office_records',{_collection:args['collection'],_id:args['id']??null,_offset:args['offset']??0,_limit:args['limit']??50});
 case 'write_office_record':return rpc('canx_write_office_record',{_collection:args['collection'],_id:args['id'],_data:args['data'],_expected_version:args['expectedVersion']??null});
 case 'read_office_skills':return {version:SKILLS_REGISTRY_VERSION,skills:args['id']?OFFICE_SKILLS.filter(s=>s.id===args['id']):OFFICE_SKILLS};
 case 'open_office_file':{
  const result=await rpc('canx_office_records',{_collection:'office_files',_id:args['id'],_limit:1}) as {records?:{data:Record<string,unknown>}[]};
  const file=result.records?.[0]?.data;
  if(!file||!deps.serviceKey||typeof file['owner_id']!=='string'||typeof file['object_path']!=='string'||!file['object_path'].startsWith(`${file['owner_id']}/`)||file['object_path'].includes('..'))throw Error('Saved file unavailable');
  const response=await deps.fetch(`${deps.url}/storage/v1/object/sign/office-files/${file['object_path'].split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:{apikey:deps.serviceKey,Authorization:`Bearer ${deps.serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:60}),redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('File unavailable');const data=await response.json() as {signedURL?:string};
  if(!data.signedURL?.startsWith('/object/sign/office-files/'))throw Error('Invalid file URL');
  return {filename:file['filename'],url:`${deps.url}/storage/v1${data.signedURL}`,expiresIn:60};
 }
 case 'submit_office_build':case 'check_office_builds':{
  const data=name==='submit_office_build'?{action:'submit',...args}:{action:'status',...args};
  const response=await deps.fetch('https://canx-office.lovable.app/api/office-work',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(data),redirect:'error',signal:AbortSignal.timeout(55000)});
  if(!response.ok)throw Error('Build result unavailable; check status before retry');return response.json();
 }
 default:throw Error('Unknown Office tool');
 }
}
