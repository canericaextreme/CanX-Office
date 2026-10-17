/** Merge event to queue-wake plan. Never launches a provider or treats a merge as new spend approval. */
import { planMergeHandoff, type MergeSignal } from "./elsie-merge-handoff";
export interface MergeWakeDeps {
  seen: (key:string)=>Promise<boolean>;
  record: (key:string, event:MergeSignal)=>Promise<boolean>;
  signalQueueCheck: (key:string)=>Promise<boolean>;
}
export type MergeWakeResult = {state:"ignored"|"already_seen"|"recorded"|"signalled"|"uncertain";reason:string};
export async function receiveMergeWake(e:MergeSignal,deps:MergeWakeDeps):Promise<MergeWakeResult>{
  const p=planMergeHandoff(e);
  if(!p.eligible||!p.key)return{state:"ignored",reason:p.reason};
  try{
    if(await deps.seen(p.key))return{state:"already_seen",reason:"Merge event already recorded"};
    const saved=await deps.record(p.key,e);
    if(!saved)return{state:"uncertain",reason:"Durable event record failed; do not dispatch"};
    const signalled=await deps.signalQueueCheck(p.key);
    return signalled?{state:"signalled",reason:"Queue check requested; no build authorized by merge"}:
      {state:"recorded",reason:"Merge saved, but queue wake not confirmed"};
  }catch{return{state:"uncertain",reason:"Merge receipt uncertain; reconcile event key before retry"};}
}
