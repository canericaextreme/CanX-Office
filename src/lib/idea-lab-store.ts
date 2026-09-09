/**
 * Idea Lab persistence.
 *
 * Device-only (browser storage) until the CanX-owned backend is connected and
 * an owner session is verified. Nothing here contacts a network.
 *
 * Base ideas come from the durable repository module (src/lib/idea-garage.ts)
 * so John sees them on every device; evidence, protection, decisions and the
 * research policy are stored on this device only and clearly labelled as such.
 */

import { IDEA_CARDS } from "./idea-garage";
import {
  DEFAULT_RESEARCH_POLICY,
  type DecisionTrack,
  type EvidenceRecord,
  type EvidenceSourceType,
  type IdeaLifecycle,
  type LabIdea,
  type ResearchPolicy,
  CRITERIA,
  SOURCE_TYPES,
} from "./idea-lab";

const EVIDENCE_KEY = "canx-idea-lab-evidence";
const OVERRIDE_KEY = "canx-idea-lab-overrides";
const PROPOSAL_KEY = "canx-idea-lab-proposals";
const POLICY_KEY = "canx-idea-lab-policy";

export interface IdeaOverride {
  protected?: boolean | undefined;
  ownerLifecycle?: IdeaLifecycle | undefined;
  decisionTrack?: DecisionTrack | undefined;
  timeToFirstDollarWeeks?: number | undefined;
  notes?: string | undefined;
}

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

const LIFECYCLES: IdeaLifecycle[] = ["proposed", "active", "holding", "archived", "rejected"];
const TRACKS: DecisionTrack[] = ["fast-revenue", "validate", "feasibility", "reject"];

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — stay in memory for this session */
  }
}

// -------------------------------------------------------------- validation

/** Imported/stored evidence is untrusted data. Never executed, only read. */
export function sanitizeEvidence(input: unknown, index = 0): EvidenceRecord | null {
  const row = (input ?? {}) as Record<string, unknown>;
  const ideaId = str(row["ideaId"], 80);
  if (!ideaId) return null;
  const sourceType = SOURCE_TYPES.some((s) => s.id === row["sourceType"])
    ? (row["sourceType"] as EvidenceSourceType)
    : "internal-estimate";
  const dateRaw = str(row["date"], 40);
  const date = Number.isFinite(Date.parse(dateRaw)) ? dateRaw : new Date().toISOString().slice(0, 10);
  const ratingsRaw = Array.isArray(row["ratings"]) ? row["ratings"] : [];
  const ratings = ratingsRaw
    .slice(0, CRITERIA.length)
    .map((r) => {
      const rr = (r ?? {}) as Record<string, unknown>;
      const criterion = CRITERIA.find((c) => c.id === rr["criterion"])?.id;
      const value = num(rr["value"]);
      if (!criterion || value === undefined) return null;
      return { criterion, value: Math.min(100, Math.max(0, Math.round(value))) };
    })
    .filter((r): r is { criterion: (typeof CRITERIA)[number]["id"]; value: number } => r !== null);
  const url = str(row["sourceUrl"], 400);
  return {
    id: str(row["id"], 60) || `ev-${Date.now()}-${index}`,
    ideaId,
    date,
    sourceType,
    summary: str(row["summary"], 800),
    sourceUrl: /^https?:\/\//i.test(url) ? url : undefined,
    collectedBy: str(row["collectedBy"], 120) || "Unattributed",
    ratings,
  };
}

// ------------------------------------------------------------------ loaders

export function loadEvidence(): EvidenceRecord[] {
  const raw = read<unknown[]>(EVIDENCE_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 2000)
    .map((r, i) => sanitizeEvidence(r, i))
    .filter((r): r is EvidenceRecord => r !== null);
}

export function saveEvidence(records: EvidenceRecord[]) {
  write(EVIDENCE_KEY, records.slice(0, 2000));
}

export function groupEvidence(records: EvidenceRecord[]): Record<string, EvidenceRecord[]> {
  const out: Record<string, EvidenceRecord[]> = {};
  for (const r of records) (out[r.ideaId] ??= []).push(r);
  return out;
}

export function loadOverrides(): Record<string, IdeaOverride> {
  const raw = read<Record<string, unknown>>(OVERRIDE_KEY, {});
  const out: Record<string, IdeaOverride> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, value] of Object.entries(raw)) {
    const row = (value ?? {}) as Record<string, unknown>;
    out[str(id, 80)] = {
      protected: row["protected"] === true,
      ownerLifecycle: LIFECYCLES.includes(row["ownerLifecycle"] as IdeaLifecycle)
        ? (row["ownerLifecycle"] as IdeaLifecycle)
        : undefined,
      decisionTrack: TRACKS.includes(row["decisionTrack"] as DecisionTrack)
        ? (row["decisionTrack"] as DecisionTrack)
        : undefined,
      timeToFirstDollarWeeks: num(row["timeToFirstDollarWeeks"]),
      notes: str(row["notes"], 1000) || undefined,
    };
  }
  return out;
}

export function saveOverrides(overrides: Record<string, IdeaOverride>) {
  write(OVERRIDE_KEY, overrides);
}

/** Innovation-AI proposals awaiting John. Never auto-promoted, never a build. */
export function loadProposals(): LabIdea[] {
  const raw = read<unknown[]>(PROPOSAL_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 200).map((item, i) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      id: str(row["id"], 80) || `prop-${i}`,
      title: str(row["title"], 200) || "Untitled proposal",
      summary: str(row["summary"], 1200),
      origin: "innovation-ai" as const,
      createdAt: str(row["createdAt"], 40) || new Date().toISOString(),
      protected: false,
      proposalPending: row["proposalPending"] !== false,
      timeToFirstDollarWeeks: num(row["timeToFirstDollarWeeks"]),
      notes: str(row["notes"], 1000) || undefined,
    };
  });
}

export function saveProposals(items: LabIdea[]) {
  write(PROPOSAL_KEY, items.slice(0, 200));
}

export function loadResearchPolicy(): ResearchPolicy {
  const row = read<Record<string, unknown>>(POLICY_KEY, {});
  const cadence = row?.["cadence"];
  return {
    cadence: cadence === "weekly" || cadence === "monthly" ? cadence : DEFAULT_RESEARCH_POLICY.cadence,
    monthlyBudgetCents: Math.max(0, Math.min(50_000, num(row?.["monthlyBudgetCents"]) ?? 0)),
    maxPassesPerIdea: Math.max(1, Math.min(10, num(row?.["maxPassesPerIdea"]) ?? 1)),
    minScoreForAutoResearch: Math.max(
      0,
      Math.min(100, num(row?.["minScoreForAutoResearch"]) ?? DEFAULT_RESEARCH_POLICY.minScoreForAutoResearch),
    ),
  };
}

export function saveResearchPolicy(policy: ResearchPolicy) {
  write(POLICY_KEY, policy);
}

// -------------------------------------------------------------- base ideas

/** Repository-backed ideas, merged with this device's overrides. */
export function baseIdeas(overrides: Record<string, IdeaOverride>): LabIdea[] {
  return IDEA_CARDS.map((card) => {
    const o = overrides[card.id] ?? {};
    return {
      id: card.id,
      title: card.title,
      summary: card.workingSummary,
      origin: card.provenance === "john" ? "john" : "sample",
      createdAt: card.captured,
      protected: o.protected === true,
      ownerLifecycle: o.ownerLifecycle,
      decisionTrack: o.decisionTrack,
      timeToFirstDollarWeeks: o.timeToFirstDollarWeeks,
      notes: o.notes,
    } satisfies LabIdea;
  });
}

export function applyOverrides(ideas: LabIdea[], overrides: Record<string, IdeaOverride>): LabIdea[] {
  return ideas.map((idea) => {
    const o = overrides[idea.id];
    if (!o) return idea;
    return {
      ...idea,
      protected: o.protected ?? idea.protected,
      ownerLifecycle: o.ownerLifecycle ?? idea.ownerLifecycle,
      decisionTrack: o.decisionTrack ?? idea.decisionTrack,
      timeToFirstDollarWeeks: o.timeToFirstDollarWeeks ?? idea.timeToFirstDollarWeeks,
      notes: o.notes ?? idea.notes,
    };
  });
}
