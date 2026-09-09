/**
 * CanX Office — Idea Lab scoring, evidence and lifecycle engine.
 *
 * Pure logic. No network calls, no AI calls, no automatic research.
 * Every number produced here is derived from dated evidence records that a
 * human or an authorised research worker attached. Nothing is invented:
 * an idea with no evidence has no Opportunity Score, not a guessed one.
 */

// ---------------------------------------------------------------- criteria

export type CriterionId =
  | "demand"
  | "willingness-to-pay"
  | "revenue-potential"
  | "recurring-revenue"
  | "time-to-first-dollar"
  | "build-cost"
  | "operating-cost"
  | "technical-feasibility"
  | "competition-gap"
  | "distribution"
  | "market-momentum"
  | "automation-potential"
  | "legal-risk"
  | "defensibility"
  | "strategic-fit";

export interface CriterionDef {
  id: CriterionId;
  label: string;
  weight: number;
  /** Plain-English meaning of a HIGH (100) rating. */
  highMeans: string;
}

export const CRITERIA: CriterionDef[] = [
  { id: "demand", label: "Demonstrated customer problem / demand", weight: 14, highMeans: "Clear, repeated, documented demand" },
  { id: "willingness-to-pay", label: "Willingness-to-pay evidence", weight: 13, highMeans: "People already pay for this" },
  { id: "revenue-potential", label: "Revenue potential", weight: 10, highMeans: "Large realistic revenue" },
  { id: "recurring-revenue", label: "Recurring-revenue potential", weight: 8, highMeans: "Naturally a subscription" },
  { id: "time-to-first-dollar", label: "Speed to first dollar", weight: 8, highMeans: "First paid customer within weeks" },
  { id: "build-cost", label: "Build / start-up cost", weight: 6, highMeans: "Cheap to start" },
  { id: "operating-cost", label: "Operating cost", weight: 5, highMeans: "Low monthly running cost" },
  { id: "technical-feasibility", label: "Technical feasibility", weight: 7, highMeans: "Clearly buildable with known tools" },
  { id: "competition-gap", label: "Competition / market gap", weight: 7, highMeans: "Real gap, weak incumbents" },
  { id: "distribution", label: "Distribution / reaching customers", weight: 5, highMeans: "Easy, cheap route to customers" },
  { id: "market-momentum", label: "Market momentum", weight: 5, highMeans: "Demand is growing now" },
  { id: "automation-potential", label: "Automation potential", weight: 5, highMeans: "Runs with little manual labour" },
  { id: "legal-risk", label: "Legal / regulatory risk", weight: 6, highMeans: "Low regulatory risk" },
  { id: "defensibility", label: "Defensibility", weight: 3, highMeans: "Hard for others to copy" },
  { id: "strategic-fit", label: "Strategic fit with CanX", weight: 3, highMeans: "Fits existing CanX strengths" },
];

export const criterionById = (id: CriterionId): CriterionDef =>
  CRITERIA.find((c) => c.id === id) ?? CRITERIA[0]!;

// ---------------------------------------------------------------- evidence

/**
 * Evidence reliability tiers. Government/official data, verified transactions
 * and direct customer evidence intentionally outweigh isolated social chatter.
 */
export type EvidenceSourceType =
  | "official-data"
  | "verified-sale"
  | "customer-interview"
  | "public-tender"
  | "competitor-pricing"
  | "industry-report"
  | "news"
  | "search-trend"
  | "reviews-complaints"
  | "forum-community"
  | "social-chatter"
  | "internal-estimate";

export interface SourceTypeDef {
  id: EvidenceSourceType;
  label: string;
  /** 0-1 reliability weight. */
  reliability: number;
}

export const SOURCE_TYPES: SourceTypeDef[] = [
  { id: "verified-sale", label: "Verified sale / payment", reliability: 1.0 },
  { id: "official-data", label: "Government / official data", reliability: 0.95 },
  { id: "public-tender", label: "Public contract or tender record", reliability: 0.9 },
  { id: "customer-interview", label: "Direct customer interview or test", reliability: 0.85 },
  { id: "competitor-pricing", label: "Competitor launch / published pricing", reliability: 0.7 },
  { id: "industry-report", label: "Industry report", reliability: 0.65 },
  { id: "reviews-complaints", label: "Reviews and complaints", reliability: 0.5 },
  { id: "news", label: "News / industry cycle", reliability: 0.45 },
  { id: "search-trend", label: "Search trend data", reliability: 0.45 },
  { id: "forum-community", label: "Forum / community discussion", reliability: 0.3 },
  { id: "social-chatter", label: "Social-media chatter", reliability: 0.2 },
  { id: "internal-estimate", label: "Internal estimate (no external evidence)", reliability: 0.15 },
];

export const sourceTypeById = (id: EvidenceSourceType): SourceTypeDef =>
  SOURCE_TYPES.find((s) => s.id === id) ?? SOURCE_TYPES[SOURCE_TYPES.length - 1]!;

export interface EvidenceRating {
  criterion: CriterionId;
  /** 0-100 rating this evidence supports for that criterion. */
  value: number;
}

export interface EvidenceRecord {
  id: string;
  ideaId: string;
  /** ISO date the evidence itself is dated (not when it was typed). */
  date: string;
  sourceType: EvidenceSourceType;
  summary: string;
  sourceUrl?: string | undefined;
  /** Who attached it: "John", "Research worker", etc. */
  collectedBy: string;
  ratings: EvidenceRating[];
}

// ---------------------------------------------------------------- lifecycle

export type IdeaLifecycle =
  | "proposed"
  | "active"
  | "holding"
  | "archived"
  | "rejected";

export const LIFECYCLE_LABELS: Record<IdeaLifecycle, string> = {
  proposed: "Proposed / Rising idea",
  active: "Active Bike Rack",
  holding: "Holding / lower priority",
  archived: "Archived (searchable)",
  rejected: "Rejected / dormant",
};

export type DecisionTrack = "fast-revenue" | "validate" | "feasibility" | "reject";

export const DECISION_TRACK_LABELS: Record<DecisionTrack, string> = {
  "fast-revenue": "FAST REVENUE",
  validate: "VALIDATE",
  feasibility: "FEASIBILITY",
  reject: "REJECT",
};

export type IdeaOrigin = "john" | "innovation-ai" | "sample";

export const ORIGIN_LABELS: Record<IdeaOrigin, string> = {
  john: "John-requested idea",
  "innovation-ai": "Proposed by Innovation AI — not approved",
  sample: "Demonstration data",
};

export interface LabIdea {
  id: string;
  title: string;
  summary: string;
  origin: IdeaOrigin;
  createdAt: string;
  /** John-protected ideas are never automatically archived or rejected. */
  protected: boolean;
  /** Set only by John in the Decision Room. */
  decisionTrack?: DecisionTrack | undefined;
  /** Manual lifecycle override by John (wins over automatic placement). */
  ownerLifecycle?: IdeaLifecycle | undefined;
  /** Estimated weeks to first revenue, when evidence supports an estimate. */
  timeToFirstDollarWeeks?: number | undefined;
  /** True while nobody has accepted the AI proposal into the rack. */
  proposalPending?: boolean | undefined;
  notes?: string | undefined;
}

// ---------------------------------------------------------------- scoring

export const DAY = 86_400_000;

export interface ScoreConfig {
  now: number;
  /** Days of silence before decay can begin. */
  decayGraceDays: number;
  /** Maximum points decay can remove. */
  maxDecayPoints: number;
  /** Points removed per 30 days beyond the grace period. */
  decayPointsPerMonth: number;
}

export const DEFAULT_SCORE_CONFIG: Omit<ScoreConfig, "now"> = {
  decayGraceDays: 60,
  maxDecayPoints: 20,
  decayPointsPerMonth: 5,
};

export interface CriterionBreakdown {
  criterion: CriterionId;
  label: string;
  weight: number;
  value: number;
  evidenceCount: number;
  reliability: number;
}

export interface IdeaScore {
  /** Null when there is no evidence at all — never a guessed number. */
  opportunity: number | null;
  /** Score before time decay. */
  rawOpportunity: number | null;
  confidence: number;
  decayPoints: number;
  evidenceCount: number;
  lastEvidenceDate: string | null;
  daysSinceEvidence: number | null;
  coverage: number;
  breakdown: CriterionBreakdown[];
  strongestSource: EvidenceSourceType | null;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

/** Recency multiplier: evidence keeps most of its force for ~a year. */
function recencyFactor(dateIso: string, now: number): number {
  const t = Date.parse(dateIso);
  if (!Number.isFinite(t)) return 0.3;
  const days = Math.max(0, (now - t) / DAY);
  if (days <= 90) return 1;
  if (days >= 730) return 0.35;
  return 1 - ((days - 90) / (730 - 90)) * 0.65;
}

/** Durable evidence = recent enough AND highly reliable. */
export function hasDurableEvidence(evidence: EvidenceRecord[], now: number): boolean {
  return evidence.some((e) => {
    const rel = sourceTypeById(e.sourceType).reliability;
    const t = Date.parse(e.date);
    const days = Number.isFinite(t) ? (now - t) / DAY : Infinity;
    return rel >= 0.85 && days <= 365;
  });
}

export function scoreIdea(
  evidence: EvidenceRecord[],
  config: ScoreConfig,
): IdeaScore {
  const { now } = config;
  const empty: IdeaScore = {
    opportunity: null,
    rawOpportunity: null,
    confidence: 0,
    decayPoints: 0,
    evidenceCount: 0,
    lastEvidenceDate: null,
    daysSinceEvidence: null,
    coverage: 0,
    breakdown: [],
    strongestSource: null,
  };
  if (evidence.length === 0) return empty;

  const buckets = new Map<CriterionId, { wSum: number; vSum: number; count: number }>();
  let totalReliability = 0;
  let strongest: SourceTypeDef | null = null;
  let latest = -Infinity;

  for (const e of evidence) {
    const src = sourceTypeById(e.sourceType);
    const w = src.reliability * recencyFactor(e.date, now);
    const t = Date.parse(e.date);
    if (Number.isFinite(t) && t > latest) latest = t;
    if (!strongest || src.reliability > strongest.reliability) strongest = src;
    totalReliability += w;
    for (const r of e.ratings) {
      const v = clamp(r.value);
      const b = buckets.get(r.criterion) ?? { wSum: 0, vSum: 0, count: 0 };
      b.wSum += w;
      b.vSum += w * v;
      b.count += 1;
      buckets.set(r.criterion, b);
    }
  }

  const breakdown: CriterionBreakdown[] = [];
  let weighted = 0;
  let weightUsed = 0;
  for (const c of CRITERIA) {
    const b = buckets.get(c.id);
    if (!b || b.wSum <= 0) continue;
    const value = clamp(b.vSum / b.wSum);
    breakdown.push({
      criterion: c.id,
      label: c.label,
      weight: c.weight,
      value: Math.round(value),
      evidenceCount: b.count,
      reliability: Math.round(Math.min(1, b.wSum) * 100) / 100,
    });
    weighted += value * c.weight;
    weightUsed += c.weight;
  }

  if (weightUsed === 0) return { ...empty, evidenceCount: evidence.length };

  const raw = clamp(weighted / weightUsed);
  const totalWeight = CRITERIA.reduce((s, c) => s + c.weight, 0);
  const coverage = weightUsed / totalWeight;

  const daysSince = Number.isFinite(latest) ? Math.floor((now - latest) / DAY) : null;

  // Decay only when the idea is genuinely going stale: no new evidence past the
  // grace period AND no durable high-reliability evidence still standing.
  let decayPoints = 0;
  if (
    daysSince !== null &&
    daysSince > config.decayGraceDays &&
    !hasDurableEvidence(evidence, now)
  ) {
    const months = (daysSince - config.decayGraceDays) / 30;
    decayPoints = Math.min(config.maxDecayPoints, months * config.decayPointsPerMonth);
  }

  // Confidence: how much reliable, broad, recent evidence stands behind the score.
  const volume = Math.min(1, totalReliability / 4);
  const confidence = clamp(
    Math.round((volume * 0.55 + coverage * 0.45) * 100),
  );

  return {
    opportunity: Math.round(clamp(raw - decayPoints)),
    rawOpportunity: Math.round(raw),
    confidence,
    decayPoints: Math.round(decayPoints),
    evidenceCount: evidence.length,
    lastEvidenceDate: Number.isFinite(latest) ? new Date(latest).toISOString() : null,
    daysSinceEvidence: daysSince,
    coverage: Math.round(coverage * 100),
    breakdown: breakdown.sort((a, b) => b.weight * b.value - a.weight * a.value),
    strongestSource: strongest ? strongest.id : null,
  };
}

// ------------------------------------------------------- lifecycle placement

export function automaticLifecycle(score: number | null): IdeaLifecycle {
  if (score === null) return "holding";
  if (score >= 70) return "active";
  if (score >= 55) return "holding";
  if (score >= 45) return "archived";
  return "rejected";
}

export interface Placement {
  lifecycle: IdeaLifecycle;
  automatic: IdeaLifecycle;
  /** True when protection or John's override kept the idea where it is. */
  heldByOwner: boolean;
  reason: string;
}

export function placeIdea(idea: LabIdea, score: number | null): Placement {
  const automatic = automaticLifecycle(score);
  if (idea.proposalPending) {
    return {
      lifecycle: "proposed",
      automatic,
      heldByOwner: false,
      reason: "Awaiting John's review — proposals never enter the rack automatically.",
    };
  }
  if (idea.ownerLifecycle) {
    return {
      lifecycle: idea.ownerLifecycle,
      automatic,
      heldByOwner: true,
      reason: "Placed by John. Automatic scoring cannot move it.",
    };
  }
  if (idea.protected && (automatic === "archived" || automatic === "rejected")) {
    return {
      lifecycle: "active",
      automatic,
      heldByOwner: true,
      reason:
        "Protected by John. Score would otherwise " +
        (automatic === "rejected" ? "mark it dormant." : "archive it."),
    };
  }
  const reasons: Record<IdeaLifecycle, string> = {
    active: "Score 70 or above — kept in the active Bike Rack.",
    holding: score === null
      ? "No evidence attached yet — held until research is done."
      : "Score 55–69 — holding, lower priority.",
    archived: "Score below 55 — moved to the searchable archive, not deleted.",
    rejected: "Score below 45 — marked rejected/dormant. Nothing is deleted.",
    proposed: "Proposed idea.",
  };
  return { lifecycle: automatic, automatic, heldByOwner: false, reason: reasons[automatic] };
}

// ------------------------------------------------------------------ history

export interface ScoreSnapshot {
  at: string;
  opportunity: number | null;
  confidence: number;
  /** Evidence id that triggered the recalculation, when known. */
  triggeredBy?: string | undefined;
  explanation: string;
}

/**
 * Rebuild the score history from the evidence trail, oldest evidence first,
 * so every change is explainable and linked to its source.
 */
export function buildHistory(
  evidence: EvidenceRecord[],
  config: ScoreConfig,
): ScoreSnapshot[] {
  const ordered = [...evidence].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const history: ScoreSnapshot[] = [];
  let prev: IdeaScore | null = null;
  for (let i = 0; i < ordered.length; i += 1) {
    const slice = ordered.slice(0, i + 1);
    const s = scoreIdea(slice, config);
    const e = ordered[i]!;
    const src = sourceTypeById(e.sourceType);
    const delta =
      prev && prev.opportunity !== null && s.opportunity !== null
        ? s.opportunity - prev.opportunity
        : null;
    const move =
      delta === null
        ? "First scored"
        : delta > 0
          ? `Up ${delta}`
          : delta < 0
            ? `Down ${Math.abs(delta)}`
            : "No change";
    history.push({
      at: e.date,
      opportunity: s.opportunity,
      confidence: s.confidence,
      triggeredBy: e.id,
      explanation: `${move} — ${src.label} (reliability ${Math.round(src.reliability * 100)}%): ${e.summary}`,
    });
    prev = s;
  }
  return history.reverse();
}

export function trendOf(history: ScoreSnapshot[]): { direction: "up" | "down" | "flat"; delta: number } {
  if (history.length < 2) return { direction: "flat", delta: 0 };
  const latest = history[0]!.opportunity ?? 0;
  const before = history[1]!.opportunity ?? 0;
  const delta = latest - before;
  return { direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat", delta };
}

/**
 * An archived idea returns as a "Rising Idea" when new evidence materially
 * improves both score and confidence.
 */
export function isRising(history: ScoreSnapshot[], lifecycle: IdeaLifecycle): boolean {
  if (lifecycle !== "archived" && lifecycle !== "rejected") return false;
  if (history.length < 2) return false;
  const now = history[0]!;
  const prev = history[1]!;
  const scoreGain = (now.opportunity ?? 0) - (prev.opportunity ?? 0);
  const confGain = now.confidence - prev.confidence;
  return scoreGain >= 8 && confGain >= 5;
}

// --------------------------------------------------------------- rack limit

export const ACTIVE_RACK_TARGET = 20;

export interface RankedIdea {
  idea: LabIdea;
  score: IdeaScore;
  placement: Placement;
  history: ScoreSnapshot[];
  trend: ReturnType<typeof trendOf>;
  rising: boolean;
  /** Pushed out of the active rack purely by the focus limit. */
  overflow: boolean;
}

/**
 * Keep the active rack focused: protected ideas always stay, then the highest
 * scoring ideas up to the limit. Overflow drops to holding — never deleted.
 */
export function rankIdeas(
  ideas: LabIdea[],
  evidenceByIdea: Record<string, EvidenceRecord[]>,
  config: ScoreConfig,
  rackLimit = ACTIVE_RACK_TARGET,
): RankedIdea[] {
  const rows: RankedIdea[] = ideas.map((idea) => {
    const evidence = evidenceByIdea[idea.id] ?? [];
    const score = scoreIdea(evidence, config);
    const placement = placeIdea(idea, score.opportunity);
    const history = buildHistory(evidence, config);
    return {
      idea,
      score,
      placement,
      history,
      trend: trendOf(history),
      rising: isRising(history, placement.lifecycle),
      overflow: false,
    };
  });

  const activeSorted = rows
    .filter((r) => r.placement.lifecycle === "active")
    .sort((a, b) => {
      if (a.idea.protected !== b.idea.protected) return a.idea.protected ? -1 : 1;
      return (b.score.opportunity ?? 0) - (a.score.opportunity ?? 0);
    });

  activeSorted.forEach((row, index) => {
    if (index >= rackLimit && !row.idea.protected) {
      row.overflow = true;
      row.placement = {
        ...row.placement,
        lifecycle: "holding",
        reason: `Active rack is limited to ${rackLimit} ideas — held just below the cut.`,
      };
    }
  });

  return rows.sort((a, b) => (b.score.opportunity ?? -1) - (a.score.opportunity ?? -1));
}

// ------------------------------------------------------- research cadence

export type ResearchCadence = "manual" | "weekly" | "monthly";

export interface ResearchPolicy {
  cadence: ResearchCadence;
  /** Monthly research spend ceiling in CAD cents. 0 = no research spend allowed. */
  monthlyBudgetCents: number;
  /** Maximum research passes per idea per cadence period. */
  maxPassesPerIdea: number;
  /** Only ideas at or above this score are researched automatically. */
  minScoreForAutoResearch: number;
}

export const DEFAULT_RESEARCH_POLICY: ResearchPolicy = {
  cadence: "manual",
  monthlyBudgetCents: 0,
  maxPassesPerIdea: 1,
  minScoreForAutoResearch: 55,
};

export interface ResearchPlanRow {
  ideaId: string;
  title: string;
  priority: number;
  eligible: boolean;
  reason: string;
}

/**
 * Decide, without calling anything, which ideas WOULD be researched next.
 * Returns an empty plan whenever the policy has no budget or is manual-only:
 * there is no continuous background research loop in this office.
 */
export function planResearch(rows: RankedIdea[], policy: ResearchPolicy): ResearchPlanRow[] {
  return rows.map((r) => {
    const score = r.score.opportunity;
    if (policy.cadence === "manual") {
      return { ideaId: r.idea.id, title: r.idea.title, priority: 0, eligible: false, reason: "Research cadence is manual — nothing runs on its own." };
    }
    if (policy.monthlyBudgetCents <= 0) {
      return { ideaId: r.idea.id, title: r.idea.title, priority: 0, eligible: false, reason: "No research budget approved." };
    }
    if (score === null) {
      return { ideaId: r.idea.id, title: r.idea.title, priority: 1, eligible: true, reason: "No evidence yet — first research pass has the highest value." };
    }
    if (score < policy.minScoreForAutoResearch && !r.idea.protected) {
      return { ideaId: r.idea.id, title: r.idea.title, priority: 0, eligible: false, reason: `Below the ${policy.minScoreForAutoResearch} auto-research threshold.` };
    }
    const staleness = Math.min(1, (r.score.daysSinceEvidence ?? 365) / 90);
    const confidenceGap = (100 - r.score.confidence) / 100;
    return {
      ideaId: r.idea.id,
      title: r.idea.title,
      priority: Math.round((score / 100) * 0.5 * 100 + staleness * 25 + confidenceGap * 25),
      eligible: true,
      reason: "High potential with room to strengthen the evidence.",
    };
  }).sort((a, b) => b.priority - a.priority);
}
