/** Safe worker entry boundary. Deliberately no task dispatch before server grants and atomic ledger exist. */
export interface PollGate {
  enabled: boolean;
  workerAuthenticated: boolean;
  currentGrant: boolean;
  ownerStopped: boolean;
  leaseHeld: boolean;
  budgetReserved: boolean;
  taskClaimed: boolean;
}
export type PollDecision = { action: "dispatch" } | { action: "stop"; reason: string };
/** Fail closed: every condition must be verified by a trusted server before dispatch. */
export function decideUnattendedPoll(g: PollGate): PollDecision {
  if (g.enabled !== true) return { action: "stop", reason: "Worker disabled" };
  if (g.workerAuthenticated !== true) return { action: "stop", reason: "Worker authentication unavailable" };
  if (g.currentGrant !== true || g.ownerStopped !== false) return { action: "stop", reason: "Current owner grant unavailable or revoked" };
  if (g.leaseHeld !== true) return { action: "stop", reason: "Atomic lease not confirmed" };
  if (g.budgetReserved !== true) return { action: "stop", reason: "Authoritative spending reservation not confirmed" };
  if (g.taskClaimed !== true) return { action: "stop", reason: "Idempotent task claim not confirmed" };
  return { action: "dispatch" };
}
