import { expect, it } from 'vitest';
import { validateManagerInput } from './manager.functions';
import { requestsRoomLook } from './manager-console';
import { isExplicitReceiptSyncRequest } from './receipt-ingestion.functions';
it('preserves a long pasted review including its last instruction', () => {
 const content = 'Claude review: ' + 'Evidence and findings. '.repeat(350) + '\nPlease answer every finding.';
 const result = validateManagerInput({messages:[{role:'user',content}]});
 expect(content.length).toBeGreaterThan(6000);
 expect(result.messages.at(-1)?.content).toBe(content);
});
it('rejects oversized messages instead of silently cutting them off', () => {
 expect(() => validateManagerInput({messages:[{role:'user',content:'x'.repeat(12001)}]})).toThrow('nothing was sent');
});
it('keeps multi-part pasted instructions in the conversation path', () => {
 const report = 'Claude review:\nReview receipts and check this screen.\nRepair memory and explain each result.';
 expect(requestsRoomLook(report)).toBe(false);
 expect(isExplicitReceiptSyncRequest(report)).toBe(false);
});
