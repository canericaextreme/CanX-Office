/** Pure merge-event handoff rules: GitHub merge notifications are signals,
 * never authorization to launch paid work or bypass owner approval.
 */
export interface MergeSignal { pr:number; merged:boolean; base:string; repo:string; sha:string; }
export function planMergeHandoff(e:MergeSignal,expectedRepo="canericaextreme/CanX-Office"):
 {eligible:boolean;reason:string;key?:string} {
 if (!e.merged) return {eligible:false,reason:"PR is not merged"};
 if (e.repo!==expectedRepo || e.base!=="main") return {eligible:false,reason:"Wrong repository or base"};
 if (!Number.isSafeInteger(e.pr)||e.pr<1||!/^[0-9a-f]{40}$/i.test(e.sha))
  return {eligible:false,reason:"Invalid merge identifier"};
 return {eligible:true,reason:"Record merge and wake authorized queue check only",key:`merge:${e.repo}:${e.pr}:${e.sha}`};
}
