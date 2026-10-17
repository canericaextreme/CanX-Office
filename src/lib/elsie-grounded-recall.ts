/** Deterministic recall from owner-scoped records already read by server.
 * Prevents generic model disclaimers where recent dialogue is plainly available.
 */
export function recentConversationRecall(question:string,context:string):string|null {
 if(!/\b(last|previous|recent) conversation\b|\bwhat (did we|were we) (just |last )?(talk|discuss)|\bwhat did we just do\b/i.test(question))return null;
 const marker="Recent turns (";
 const start=context.indexOf(marker);
 if(start<0)return "I could not read the saved recent conversation. I cannot verify what we discussed.";
 const next=context.slice(start).split("\n").slice(1);
 const lines=next.filter(x=>/^\- (John|Elsie|Claude) \[/.test(x));
 if(!lines.length)return "The recent-conversation records were empty. I cannot verify the last discussion.";
 const last=lines.slice(-8).filter(x=>!/(what was our last conversation|tell me what our last conversation|do you remember our last conversation)/i.test(x));
 if(!last.length)return "The saved excerpt does not contain enough earlier dialogue to identify the subject.";
 return "Here is what our saved recent conversation shows (not a full transcript):\n"+last.join("\n")+"\nI can continue from these saved records. I will verify any unfinished builder task before restarting it.";
}
