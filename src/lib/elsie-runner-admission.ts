/** Phase 3: deterministic scheduler planning only. No provider calls.
 * Actual execution requires a server-owned identity, lease and atomic ledger.
 */
import { decideExtendedWork, type ExtendedWorkSnapshot } from "./elsie-extended-work";
import { checkElsieDailyBudget, type DailyBuildBudget } from "./elsie-daily-budget";
export interface SchedulerTickInput {
  sessionId: string;
  verifiedGrantSessionId: string | null;
  snapshot: ExtendedWorkSnapshot;
  dailyBudget: DailyBuildBudget;
  expectedTaskId: string;
  actualTaskId: string | null;
  existingRunId?: number | null;
  now: string;
}
export type SchedulerTickDecision = { action: "dispatch"; taskId: string } | { action: "wait"|"stop"; reason: string };
export function decideSchedulerTick(input: SchedulerTickInput): SchedulerTickDecision {
  if (!input.sessionId || input.verifiedGrantSessionId !== input.sessionId)
    return {action:"stop",reason:"Session-bound authorization is unavailable"};
  if (input.now !== input.snapshot.now || input.now !== input.dailyBudget.now)
    return {action:"stop",reason:"Budget and task evidence were not checked at the same instant"};
  if (!input.actualTaskId || input.expectedTaskId !== input.actualTaskId)
    return {action:"wait",reason:"Task identity differs from the authorized budget check"};
  if (input.existingRunId !== null && input.existingRunId !== undefined)
    return {action:"wait",reason:"Existing run receipt requires status reconciliation"};
  const gate = decideExtendedWork(input.snapshot);
  if (gate.state !== "release")
    return {action:gate.state==="stop"?"stop":"wait",reason:gate.reason};
  const budget=checkElsieDailyBudget(input.dailyBudget);
  if (!budget.ok) return {action:"stop",reason:budget.reason};
  if (input.dailyBudget.nextBuildUpperBoundCents !== input.snapshot.estimatedNextBuildCents ||
      budget.availableCents !== input.snapshot.dailyBudgetRemainingCents)
    return {action:"stop",reason:"Budget reservation views disagree"};
  return {action:"dispatch",taskId:input.actualTaskId};
}
