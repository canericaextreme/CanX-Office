/** Durable transition rules for an owner-controlled extended work session.
 * The persistence layer must use an atomic compare-and-set on version and owner.
 * This pure module NEVER schedules or authorizes builds by itself.
 */
export type ElsieSessionState = "draft" | "active" | "paused" | "stopped" | "expired";
export type ElsieSessionEvent =
  | { kind: "activate"; now: string }
  | { kind: "pause"; now: string }
  | { kind: "resume"; now: string }
  | { kind: "owner_stop"; now: string }
  | { kind: "budget_exhausted"; now: string }
  | { kind: "authorization_revoked"; now: string }
  | { kind: "tick"; now: string };
export interface ElsieSessionRecord {
  id: string;
  ownerId: string;
  state: ElsieSessionState;
  startedAt: string;
  expiresAt: string;
  updatedAt: string;
  version: number;
  stopReason?: string;
}
export function transitionElsieSession(s: ElsieSessionRecord, event: ElsieSessionEvent):
  { ok: true; record: ElsieSessionRecord } | { ok: false; reason: string } {
  const now = Date.parse(event.now), start = Date.parse(s.startedAt), end = Date.parse(s.expiresAt);
  if (!s.ownerId || !s.id || !Number.isSafeInteger(s.version) || s.version < 0 ||
    ![now,start,end].every(Number.isFinite) || end <= start ||
    end-start > 10*3600_000 || now < start) return { ok:false, reason:"Invalid owner, version, clock or window" };
  const update=(state:ElsieSessionState,stopReason?:string)=>({ok:true as const,record:{...s,state,updatedAt:event.now,version:s.version+1,...(stopReason?{stopReason}:{})}});
  if (s.state === "stopped" || s.state === "expired") return {ok:false,reason:"Terminal session cannot restart"};
  if (now >= end) return update("expired","Work window elapsed");
  if (event.kind==="owner_stop") return update("stopped","Owner stopped the session");
  if (event.kind==="budget_exhausted") return update("stopped","Daily spending limit reached");
  if (event.kind==="authorization_revoked") return update("stopped","Authorization revoked");
  if (event.kind==="pause") return s.state==="active" ? update("paused") : {ok:false,reason:"Only active sessions can pause"};
  if (event.kind==="activate") return s.state==="draft" ? update("active") : {ok:false,reason:"Already started"};
  if (event.kind==="resume") return s.state==="paused" ? update("active") : {ok:false,reason:"Only paused sessions can resume"};
  if (event.kind==="tick") return s.state==="active" ? {ok:true,record:s} : {ok:false,reason:"Work session is not active"};
  return {ok:false,reason:"Unknown transition"};
}
