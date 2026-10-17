/** Pure admission control for an Elsie extended work session.
 * This is a POLICY helper, not an unattended worker or a new permission grant.
 * A server runner must re-read live budget, owner authorization, builder state,
 * task evidence and lease ownership before EVERY dispatch.
 */
export const MAX_EXTENDED_WORK_HOURS = 10;
export const MAX_EXTENDED_TASKS_PER_BUILDER = 3;
export const MAX_INFLIGHT_PER_BUILDER = 1;
export type ExtendedWorkDecision =
  | { state: "release"; remainingMinutes: number }
  | { state: "wait"; reason: string }
  | { state: "stop"; reason: string };
export interface ExtendedWorkSnapshot {
  now: string;
  sessionStartedAt: string;
  sessionExpiresAt: string;
  authorized: boolean;
  leaseOwned: boolean;
  ownerSessionValid: boolean;
  budgetCheckedAt: string | null;
  dailyBudgetRemainingCents: number | null;
  estimatedNextBuildCents: number | null;
  builderIdleVerified: boolean;
  inFlight: number;
  queued: number;
  taskGreen: boolean;
  hasOwnerQueueMarker: boolean;
  taskAlreadyAttempted: boolean;
  needsMergeOrDeploymentApproval: boolean;
  highRisk: boolean;
  statusReadSucceeded: boolean;
}
export function decideExtendedWork(s: ExtendedWorkSnapshot): ExtendedWorkDecision {
  const now = Date.parse(s.now);
  const start = Date.parse(s.sessionStartedAt);
  const end = Date.parse(s.sessionExpiresAt);
  if (![now,start,end].every(Number.isFinite) || end <= start || end - start > MAX_EXTENDED_WORK_HOURS * 3600_000)
    return { state: "stop", reason: "Invalid or excessive work window" };
  if (now >= end) return { state: "stop", reason: "Ten-hour maximum window expired" };
  if (!s.authorized || !s.ownerSessionValid) return { state: "stop", reason: "Owner authorization not valid" };
  if (!s.leaseOwned) return { state: "wait", reason: "Another worker owns the dispatch lease" };
  if (s.highRisk || s.needsMergeOrDeploymentApproval) return { state: "stop", reason: "Owner decision required" };
  if (s.queued > MAX_EXTENDED_TASKS_PER_BUILDER || s.queued < 0)
    return { state: "stop", reason: "Queue exceeds bounded capacity" };
  if (!s.taskGreen || !s.hasOwnerQueueMarker || s.taskAlreadyAttempted)
    return { state: "wait", reason: "No eligible unattempted owner-approved green task" };
  if (!s.statusReadSucceeded || !s.builderIdleVerified || s.inFlight !== 0)
    return { state: "wait", reason: "Builder availability not verified or build active" };
  const checked = s.budgetCheckedAt === null ? NaN : Date.parse(s.budgetCheckedAt);
  if (!Number.isFinite(checked) || checked > now || now - checked > 5 * 60_000 ||
      s.dailyBudgetRemainingCents === null || s.estimatedNextBuildCents === null ||
      !Number.isSafeInteger(s.dailyBudgetRemainingCents) || !Number.isSafeInteger(s.estimatedNextBuildCents) ||
      s.estimatedNextBuildCents <= 0 || s.dailyBudgetRemainingCents < s.estimatedNextBuildCents)
    return { state: "stop", reason: "Daily budget unavailable, stale, invalid or insufficient" };
  return { state: "release", remainingMinutes: Math.floor((end - now) / 60_000) };
}
