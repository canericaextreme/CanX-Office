import {describe,it,expect,vi} from 'vitest';
import type {OwnerVerification} from './canx-backend.server';
import {workerOwnerActionWith} from './elsie-worker-owner.functions';
const id='00000000-0000-4000-8000-000000000001',now=Date.parse('2026-10-20T01:00:00Z');
const deps=()=>({verify:vi.fn(async(_token:string):Promise<OwnerVerification>=>({ok:true as const,userId:id,email:'owner@example.test',aal:'aal2' as const})),rpc:vi.fn(async()=>({ok:true,body:id as unknown})),now:()=>now});
describe('worker owner controls',()=>{
 it('refuses authorization without fresh owner MFA',async()=>{const d=deps();d.verify.mockResolvedValue({ok:true,userId:id,email:'owner@example.test',aal:'aal1'});expect((await workerOwnerActionWith(d,{action:'stop',accessToken:'fixture',sessionId:id})).ok).toBe(false);expect(d.rpc).not.toHaveBeenCalled();});
 it('passes only explicit bounded task IDs to the enrollment RPC',async()=>{const d=deps();expect((await workerOwnerActionWith(d,{action:'enroll',accessToken:'fixture',expires:'2026-10-20T02:00:00Z',maxCents:100,tasks:[id]})).sessionId).toBe(id);expect(d.rpc).toHaveBeenCalledWith('fixture','elsie_worker_enroll',{_expires:'2026-10-20T02:00:00Z',_max_cents:100,_tasks:[id]});});
 it('rejects duplicate tasks or an excessive authorization window',async()=>{const d=deps();const input={action:'enroll',accessToken:'fixture',expires:'2026-10-20T02:00:00Z',maxCents:100,tasks:[id,id]};expect((await workerOwnerActionWith(d,input)).ok).toBe(false);expect((await workerOwnerActionWith(d,{...input,tasks:[id],expires:'2026-10-20T12:00:00Z'})).ok).toBe(false);expect(d.rpc).not.toHaveBeenCalled();});
 it('reports unavailable backend and an uncertain enrollment without claiming activation',async()=>{const d=deps();d.rpc.mockResolvedValue({ok:false,body:null});expect((await workerOwnerActionWith(d,{action:'status',accessToken:'fixture'})).ok).toBe(false);d.rpc.mockResolvedValue({ok:true,body:null});expect((await workerOwnerActionWith(d,{action:'enroll',accessToken:'fixture',expires:'2026-10-20T02:00:00Z',maxCents:0,tasks:[id]})).detail).toContain('uncertain');});
});
