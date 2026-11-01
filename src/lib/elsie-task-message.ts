import { elsieTaskInput, type ElsieTaskInput } from './elsie-task-loop';

/** Explicit, versioned internal task message over the existing colleague relay.
 * The transport IDs are authoritative; message content cannot replace them.
 * This is not inferred from natural-language writing requests or saved records.
 */
export const ELSIE_TASK_MESSAGE_PREFIX = 'CANX_ELSIE_TEXT_TASK_V1\n';
const reserved = 'CANX_ELSIE_TEXT_TASK';
const bodySchema = elsieTaskInput.pick({ specNoteId: true, ruleId: true, instruction: true }).strict();
export type ElsieTaskMessage =
  | { kind: 'ordinary' }
  | { kind: 'invalid' }
  | { kind: 'elsie'; input: ElsieTaskInput };

export function readElsieTaskMessage(envelope: {
  requestId: string; taskId: string; colleague: 'claude' | 'chatgpt'; message: string;
}): ElsieTaskMessage {
  if (!envelope.message.startsWith(reserved)) return { kind: 'ordinary' };
  if (!envelope.message.startsWith(ELSIE_TASK_MESSAGE_PREFIX)) return { kind: 'invalid' };
  try {
    const body = bodySchema.safeParse(JSON.parse(envelope.message.slice(ELSIE_TASK_MESSAGE_PREFIX.length)));
    if (!body.success) return { kind: 'invalid' };
    const input = elsieTaskInput.safeParse({
      ...body.data, requestId: envelope.requestId, taskId: envelope.taskId, colleague: envelope.colleague,
    });
    return input.success ? { kind: 'elsie', input: input.data } : { kind: 'invalid' };
  } catch { return { kind: 'invalid' }; }
}
