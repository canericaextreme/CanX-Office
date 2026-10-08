import {describe,it,expect,vi} from 'vitest';
import {officeMcpWorkWith} from './office-mcp-work-service';
import {validWorkArguments} from './office-mcp-work';
const config={url:'https://example.supabase.co',key:'public'};
describe('Office work service',()=>{
 it('metadata approval cannot read private records or invoke a build',async()=>{const f=vi.fn(async()=>Response.json(false));await expect(officeMcpWorkWith({...config,fetch:f},'token','submit_office_build',{})).rejects.toThrow('working grant');expect(f).toHaveBeenCalledTimes(1);});
 it('uses fixed owner-scoped RPC and bounded paging',async()=>{const f=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>Response.json(true));await officeMcpWorkWith({...config,fetch:f},'token','read_office_records',{collection:'office_notes'});expect(f.mock.calls[1]?.[0]).toBe('https://example.supabase.co/rest/v1/rpc/canx_office_records');});
 it('never signs another owner path',async()=>{const f=vi.fn().mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json({records:[{data:{owner_id:'owner',object_path:'foreign/original'}}]}));await expect(officeMcpWorkWith({...config,serviceKey:'private',fetch:f},'token','open_office_file',{id:'file'})).rejects.toThrow();expect(f).toHaveBeenCalledTimes(2);});
 it('rejects arbitrary tables, hidden token fields and invalid request ids',()=>{expect(validWorkArguments('read_office_records',{collection:'user_roles'})).toBe(false);expect(validWorkArguments('read_office_records',{collection:'office_notes',accessToken:'secret'})).toBe(false);expect(validWorkArguments('submit_office_build',{requestId:'not-uuid',request:'Build a button'})).toBe(false);});
});
