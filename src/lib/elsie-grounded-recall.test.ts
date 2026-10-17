import{describe,it,expect}from"vitest";import{recentConversationRecall}from"./elsie-grounded-recall";
const ctx="Recent turns (3, oldest first; earlier turns are pruned):\n- John [2026-10-17T02:36]: Read the synopsis list from one to nineteen.\n- Elsie [2026-10-17T02:36]: I cannot read the synopsis list.\n- John [2026-10-17T02:37]: Can you tell me what our last conversation was?\nOld plans are not completed work";
describe("Direct saved conversational recall",()=>{
 it("quotes the latest real saved subject instead of denying memory",()=>{const r=recentConversationRecall("Can you tell me what our last conversation was?",ctx)!;expect(r).toContain("synopsis list");expect(r).not.toContain("Can you tell me");});
 it("does not interfere with ordinary questions",()=>expect(recentConversationRecall("What is on my budget?",ctx)).toBeNull());
 it("does not invent absent records",()=>expect(recentConversationRecall("What was our last conversation?","No records")!).toContain("could not read"));
});