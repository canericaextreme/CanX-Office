/** Daily budget admission for the eventual authenticated Elsie scheduler.
 * Money is stored as integer cents; never infer daily available credit from
 * a monthly setting. Unknown cost or failed reads fail closed.
 */
export interface DailyBuildBudget {
  dayKey: string;
  now: string;
  dailyCapCents: number;
  settledCents: number;
  reservedCents: number;
  perBuildCapCents: number;
  providerRemainingCents: number | null;
  nextBuildUpperBoundCents: number | null;
  sourceVerifiedAt: string;
}
export type DailyBudgetAdmission = { ok: true; availableCents: number } | { ok: false; reason: string };
export function checkElsieDailyBudget(b: DailyBuildBudget): DailyBudgetAdmission {
  const now=Date.parse(b.now),checked=Date.parse(b.sourceVerifiedAt);
  if (!Number.isFinite(now)||!Number.isFinite(checked)||checked>now||now-checked>300000)
    return {ok:false,reason:"Budget evidence stale or unavailable"};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.dayKey)||new Date(now).toISOString().slice(0,10)!==b.dayKey)
    return {ok:false,reason:"Budget day does not match UTC accounting date"};
  const values=[b.dailyCapCents,b.settledCents,b.reservedCents,b.perBuildCapCents,b.providerRemainingCents,b.nextBuildUpperBoundCents];
  if (values.some(x=>x===null||!Number.isSafeInteger(x)||x<0))
    return {ok:false,reason:"Budget amount missing or invalid"};
  const cost=b.nextBuildUpperBoundCents!;
  if (cost===0||b.perBuildCapCents===0||cost>b.perBuildCapCents)
    return {ok:false,reason:"Proposed build exceeds per-build ceiling"};
  const available=b.dailyCapCents-b.settledCents-b.reservedCents;
  if (available<cost || b.providerRemainingCents!<cost)
    return {ok:false,reason:"Daily cap or provider credit insufficient"};
  return {ok:true,availableCents:available};
}
