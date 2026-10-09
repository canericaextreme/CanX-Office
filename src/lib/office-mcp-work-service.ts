import { OFFICE_SKILLS, SKILLS_REGISTRY_VERSION } from './office-skills.ts';
// Safe, fixed database messages from the Office record functions; anything else stays generic.
export const KNOWN_RECORD_ERRORS=['Office working grant required','Invalid record','Field is not editable through this tool','Record changed; read it again before updating','Record missing; nothing replaced','Use the established import, approval or build workflow for this collection','Imported project originals are preserved; use separate project plan records','Finance document patch required','Owner Finance record required','Initialize Finance inside the Office before editing'];
export class OfficeWorkError extends Error {}
export interface OfficeWorkServiceDeps {
 url:string;key:string;serviceKey?:string;fetch:typeof fetch;
}
export async function officeMcpWorkWith(deps:OfficeWorkServiceDeps,token:string,name:string,args:Record<string,unknown>):Promise<unknown>{
 const headers={apikey:deps.key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 const rpc=async(name:string,args:unknown)=>{
  const response=await deps.fetch(`${deps.url}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(args),redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(!response.ok){const body=await response.json().catch(()=>null) as {message?:unknown}|null;const m=typeof body?.message==='string'?body.message:'';throw new OfficeWorkError(KNOWN_RECORD_ERRORS.includes(m)?m:`Office record service refused the request (HTTP ${response.status})`);}return response.json();
 };
 if(await rpc('canx_mcp_work_active',{})!==true)throw new OfficeWorkError('Office working grant required');
 switch(name){
 case 'read_office_records':return rpc('canx_office_records',{_collection:args['collection'],_id:args['id']??null,_offset:args['offset']??0,_limit:args['limit']??50});
 case 'write_office_record':return rpc('canx_write_office_record',{_collection:args['collection'],_id:args['id'],_data:args['data'],_expected_version:args['expectedVersion']??null});
 case 'read_office_skills':return {version:SKILLS_REGISTRY_VERSION,skills:args['id']?OFFICE_SKILLS.filter(s=>s.id===args['id']):OFFICE_SKILLS};
 case 'open_office_file':{
  const result=await rpc('canx_office_records',{_collection:'office_files',_id:args['id'],_limit:1}) as {records?:{data:Record<string,unknown>}[]};
  const file=result.records?.[0]?.data;
  if(!file||!deps.serviceKey||typeof file['owner_id']!=='string'||typeof file['object_path']!=='string'||!file['object_path'].startsWith(`${file['owner_id']}/`)||file['object_path'].includes('..'))throw Error('Saved file unavailable');
  const response=await deps.fetch(`${deps.url}/storage/v1/object/sign/office-files/${file['object_path'].split('/').map(encodeURIComponent).join('/')}`,{method:'POST',headers:{apikey:deps.serviceKey,Authorization:`Bearer ${deps.serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:60}),redirect:'manual',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('File unavailable');const data=await response.json() as {signedURL?:string};
  if(!data.signedURL?.startsWith('/object/sign/office-files/'))throw Error('Invalid file URL');
  return {filename:file['filename'],url:`${deps.url}/storage/v1${data.signedURL}`,expiresIn:60};
 }
 case 'submit_office_build':case 'check_office_builds':case 'relay_to_colleague':case 'read_colleague_replies':{
  const data=name==='submit_office_build'?{action:'submit',...args}:name==='relay_to_colleague'?{action:'relay',...args}:name==='read_colleague_replies'?{action:'relay_read',...args}:{action:'status',...args};
  const response=await deps.fetch('https://canx-office.lovable.app/api/office-work',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(data),redirect:'manual',signal:AbortSignal.timeout(55000)});
  if(!response.ok){ const body=await response.json().catch(()=>null); const known=['Server connection required','Authorization required','Office work not confirmed. Check existing builds before retrying; a current working grant is required.']; const reason=known.includes(body?.error)?body.error:'Unclassified bridge response'; return {ok:false,bridgeReason:reason,bridgeCode:['CANX_BACKEND_NOT_CONFIGURED','CANX_WORK_RPC_UNAVAILABLE','CANX_CLIENT_AUTHORIZATION_FAILED','CANX_WORK_GRANT_REQUIRED','CANX_CLAIMS_INVALID','CANX_WORK_UNCONFIRMED','CANX_AUTH_URL_INVALID','CANX_AUTH_HEADER_INVALID','CANX_AUTH_FETCH_INVOCATION_FAILED','CANX_AUTH_REQUEST_TIMEOUT','CANX_AUTH_NETWORK_FAILED','CANX_AUTH_INPUT_INVALID','CANX_AUTH_REQUEST_FAILED','CANX_AUTH_HTTP_REJECTED','CANX_AUTH_RESPONSE_INVALID','CANX_AUTH_ISSUER_MISMATCH','CANX_AUTH_CLAIMS_INVALID','CANX_AUTH_SESSION_REQUEST_FAILED','CANX_AUTH_SESSION_HTTP_REJECTED','CANX_AUTH_SESSION_RESPONSE_INVALID','CANX_AUTH_SESSION_INACTIVE'].includes(body?.code)?body.code:undefined,detail:`Office build bridge returned HTTP ${response.status}. Nothing was retried; no build result is confirmed.`,code:'office_build_bridge_http',status:response.status}; }
  if(!response.headers.get('Content-Type')?.includes('application/json'))return {ok:false,detail:'Office build bridge returned a non-JSON response. Nothing was retried.',code:'office_build_bridge_content_type'};return response.json();
 }
 default:throw Error('Unknown Office tool');
 }
}
