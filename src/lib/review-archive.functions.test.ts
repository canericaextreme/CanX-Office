import { expect, it, vi } from 'vitest';
import { archiveReviewWith } from './review-archive.functions';
import type { ClaudeReviewReply } from './claude-review.functions';
const reply = {ok:true, structuredComplete:true, review:{recommendation:'disagree'}} as ClaudeReviewReply;
it('does not save reviews without a verified owner', async () => {
 const write=vi.fn(); const result=await archiveReviewWith({verify:async()=>({ok:false,reason:'no_session',message:'Sign in'}),read:vi.fn(),write},'',reply);
 expect(result.saved).toBe(false); expect(write).not.toHaveBeenCalled();
});
it('only reports saved after read-back succeeds', async () => {
 const deps={verify:vi.fn(async()=>({ok:true as const,userId:'owner',email:'',aal:'aal2'})),write:vi.fn(async()=>({ok:true})),read:vi.fn(async()=>({ok:false,body:[] as unknown[]}))};
 expect((await archiveReviewWith(deps,'token',reply)).saved).toBe(false);
 deps.read.mockResolvedValue({ok:true,body:[{}]});
 expect((await archiveReviewWith(deps,'token',reply)).saved).toBe(true);
});
it('does not archive incomplete reviews', async () => {
 const write=vi.fn(); const deps={verify:async()=>({ok:true as const,userId:'owner',email:'',aal:'aal2'}),read:vi.fn(),write};
 expect((await archiveReviewWith(deps,'token',{...reply,structuredComplete:false})).saved).toBe(false); expect(write).not.toHaveBeenCalled();
});
