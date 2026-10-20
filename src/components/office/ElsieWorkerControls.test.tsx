// @vitest-environment happy-dom
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const h=vi.hoisted(()=>({call:vi.fn(),verified:true}));
vi.mock('@tanstack/react-start',()=>({useServerFn:()=>h.call}));
vi.mock('@/lib/elsie-worker-owner.functions',()=>({ownerWorkerAction:'worker'}));
vi.mock('@/lib/owner-session',()=>({useOwnerSession:()=>({accessToken:'fixture-owner',stepUpComplete:h.verified})}));
import {ElsieWorkerControls} from './ElsieWorkerControls';
const task='00000000-0000-4000-8000-000000000001',session='00000000-0000-4000-8000-000000000002';
beforeEach(()=>{h.verified=true;h.call.mockReset();h.call.mockResolvedValue({ok:true,detail:'Read',status:{eligible:[{id:task,title:'Fix the Office label',worker:'claude'}],sessions:[{id:session,expires_at:'2099-01-01T00:00:00Z',stopped_at:null,max_cents:100}]}});});
afterEach(cleanup);
describe('visible owner worker authorization and stop controls',()=>{
 it('requires MFA and never enrolls merely by opening the card',()=>{h.verified=false;render(<ElsieWorkerControls/>);expect((screen.getByRole('button',{name:'Read worker status'}) as HTMLButtonElement).disabled).toBe(true);expect(h.call).not.toHaveBeenCalled();});
 it('shows the exact task and budget for owner review before one enrollment',async()=>{
 render(<ElsieWorkerControls/>);fireEvent.click(screen.getByRole('button',{name:'Read worker status'}));await screen.findByText(/Fix the Office label/);
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Review authorization'}));
 expect(screen.getByRole('heading',{name:'John — review worker authorization'})).toBeTruthy();expect(screen.getByText(/total ceiling of US\$0.00/)).toBeTruthy();
 expect(h.call.mock.calls.some(([r])=>r.data.action==='enroll')).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Authorize these tasks'}));await waitFor(()=>expect(h.call.mock.calls.some(([r])=>r.data.action==='enroll')).toBe(true));
 expect(h.call.mock.calls.find(([r])=>r.data.action==='enroll')?.[0].data).toMatchObject({tasks:[task],maxCents:0});
 });
 it('hides saved worker information after owner verification is lost',async()=>{const view=render(<ElsieWorkerControls/>);fireEvent.click(screen.getByRole('button',{name:'Read worker status'}));await screen.findByRole('button',{name:'Stop this enrollment'});h.verified=false;view.rerender(<ElsieWorkerControls/>);expect(screen.queryByRole('button',{name:'Stop this enrollment'})).toBeNull();});
 it('offers a reachable stop button for the exact saved enrollment',async()=>{
 render(<ElsieWorkerControls/>);fireEvent.click(screen.getByRole('button',{name:'Read worker status'}));await screen.findByRole('button',{name:'Stop this enrollment'});
 fireEvent.click(screen.getByRole('button',{name:'Stop this enrollment'}));await waitFor(()=>expect(h.call).toHaveBeenCalledWith({data:{action:'stop',accessToken:'fixture-owner',sessionId:session}}));
 });
});
