import { describe, it, expect } from 'vitest';
import { officeMcpWorkWith } from './office-mcp-work-service';
const fake=(writeStatus:number,msg:string)=>(async(url:string)=>url.includes('canx_mcp_work_active')?Response.json(true):Response.json({message:msg},{status:writeStatus})) as unknown as typeof fetch;
const call=(f:typeof fetch)=>officeMcpWorkWith({url:'https://x',key:'k',fetch:f},'t','write_office_record',{collection:'office_notes',id:'a',data:{title:'x'}});
describe('write failure reasons',()=>{
 it('surfaces fixed database reasons after an active grant',async()=>{await expect(call(fake(400,'Invalid record'))).rejects.toThrow('Invalid record');});
 it('never leaks unknown database text',async()=>{await expect(call(fake(500,'secret detail row 9'))).rejects.toThrow('Office record service refused the request (HTTP 500)');});
});
