/**
 * Idea Lab — evidence-driven scoring and lifecycle board for the Bike Rack.
 *
 * All scoring is derived from dated evidence stored on this device.
 * No research runs by itself, no AI call is made from this screen.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Pin,
  PinOff,
  Search,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACTIVE_RACK_TARGET,
  CRITERIA,
  DECISION_TRACK_LABELS,
  DEFAULT_SCORE_CONFIG,
  LIFECYCLE_LABELS,
  ORIGIN_LABELS,
  SOURCE_TYPES,
  criterionById,
  planResearch,
  rankIdeas,
  sourceTypeById,
  type CriterionId,
  type DecisionTrack,
  type EvidenceRecord,
  type EvidenceSourceType,
  type IdeaLifecycle,
  type RankedIdea,
  type ResearchPolicy,
} from "@/lib/idea-lab";
import {
  applyOverrides,
  baseIdeas,
  groupEvidence,
  loadEvidence,
  loadOverrides,
  loadProposals,
  loadResearchPolicy,
  saveEvidence,
  saveOverrides,
  saveProposals,
  saveResearchPolicy,
  type IdeaOverride,
} from "@/lib/idea-lab-store";

const LANES: { lifecycle: IdeaLifecycle; blurb: string }[] = [
  { lifecycle: "active", blurb: "Score 70–100. Focused on the strongest ideas." },
  { lifecycle: "holding", blurb: "Score 55–69, or waiting for its first evidence." },
  { lifecycle: "archived", blurb: "Below 55. Searchable, never deleted." },
  { lifecycle: "rejected", blurb: "Below 45. Dormant unless John protects it." },
];

function Trend({ direction, delta }: { direction: "up" | "down" | "flat"; delta: number }) {
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const tone =
    direction === "up" ? "text-emerald-500" : direction === "down" ? "text-rose-500" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${delta}`}
    </span>
  );
}

function ScoreDial({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-center">
      <div className="text-xl font-semibold tabular-nums text-foreground">
        {value === null ? "—" : value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

export function IdeaLab() {
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [overrides, setOverrides] = useState<Record<string, IdeaOverride>>({});
  const [proposals, setProposals] = useState(() => [] as ReturnType<typeof loadProposals>);
  const [policy, setPolicy] = useState<ResearchPolicy>({
    cadence: "manual",
    monthlyBudgetCents: 0,
    maxPassesPerIdea: 1,
    minScoreForAutoResearch: 55,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setEvidence(loadEvidence());
    setOverrides(loadOverrides());
    setProposals(loadProposals());
    setPolicy(loadResearchPolicy());
    setReady(true);
  }, []);

  const rows = useMemo(() => {
    const ideas = applyOverrides([...baseIdeas(overrides), ...proposals], overrides);
    return rankIdeas(ideas, groupEvidence(evidence), { now: Date.now(), ...DEFAULT_SCORE_CONFIG });
  }, [evidence, overrides, proposals]);

  const plan = useMemo(() => planResearch(rows, policy), [rows, policy]);
  const open = rows.find((r) => r.idea.id === openId) ?? null;

  function updateOverride(id: string, patch: IdeaOverride) {
    const next = { ...overrides, [id]: { ...overrides[id], ...patch } };
    setOverrides(next);
    saveOverrides(next);
  }

  function addEvidence(record: EvidenceRecord) {
    const next = [record, ...evidence];
    setEvidence(next);
    saveEvidence(next);
  }

  function updatePolicy(patch: Partial<ResearchPolicy>) {
    const next = { ...policy, ...patch };
    setPolicy(next);
    saveResearchPolicy(next);
  }

  function acceptProposal(id: string) {
    const next = proposals.map((p) => (p.id === id ? { ...p, proposalPending: false } : p));
    setProposals(next);
    saveProposals(next);
  }

  function rejectProposal(id: string) {
    const next = proposals.filter((p) => p.id !== id);
    setProposals(next);
    saveProposals(next);
    updateOverride(id, { ownerLifecycle: "rejected" });
  }

  const rising = rows.filter((r) => r.rising);
  const pending = rows.filter((r) => r.placement.lifecycle === "proposed");
  const searching = query.trim().length > 0;
  const matches = rows.filter((r) =>
    (r.idea.title + " " + r.idea.summary).toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Idea Lab — evidence scoring</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-[11px]">Saved on this device only</Badge>
              <Badge variant="outline" className="text-[11px]">No automatic research running</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Every idea carries two separate numbers: an <strong>Opportunity Score</strong> (how attractive it
            looks commercially) and an <strong>Evidence Confidence</strong> (how much dated, reliable evidence
            stands behind that score). Scores only move when someone attaches evidence. Nothing here authorises
            building or spending — that stays John's decision.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label className="text-xs">Research cadence</Label>
              <Select value={policy.cadence} onValueChange={(v) => updatePolicy({ cadence: v as ResearchPolicy["cadence"] })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual only (nothing runs)</SelectItem>
                  <SelectItem value="weekly">Weekly (needs a connection)</SelectItem>
                  <SelectItem value="monthly">Monthly (needs a connection)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs" htmlFor="lab-budget">Monthly research ceiling (CAD $)</Label>
              <Input
                id="lab-budget"
                type="number"
                min={0}
                className="mt-1"
                value={policy.monthlyBudgetCents / 100}
                onChange={(e) => updatePolicy({ monthlyBudgetCents: Math.max(0, Math.round(Number(e.target.value || 0) * 100)) })}
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="lab-min">Auto-research only above score</Label>
              <Input
                id="lab-min"
                type="number"
                min={0}
                max={100}
                className="mt-1"
                value={policy.minScoreForAutoResearch}
                onChange={(e) => updatePolicy({ minScoreForAutoResearch: Math.max(0, Math.min(100, Number(e.target.value || 0))) })}
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="lab-passes">Passes per idea per period</Label>
              <Input
                id="lab-passes"
                type="number"
                min={1}
                max={10}
                className="mt-1"
                value={policy.maxPassesPerIdea}
                onChange={(e) => updatePolicy({ maxPassesPerIdea: Math.max(1, Math.min(10, Number(e.target.value || 1))) })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            These limits are recorded, not enforced yet: no research service is connected, so no research pass
            can run and no cost can be incurred. Next in line if research is ever switched on:{" "}
            {plan.filter((p) => p.eligible).slice(0, 3).map((p) => p.title).join(", ") || "nothing — cadence is manual or no budget is approved."}
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          placeholder="Search every idea, including the archive"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-md"
          aria-label="Search ideas"
        />
      </div>

      {searching ? (
        <Lane
          title={`Search results (${matches.length})`}
          blurb="Archived and rejected ideas are always findable here."
          rows={matches}
          onOpen={setOpenId}
          onToggleProtect={(id, value) => updateOverride(id, { protected: value })}
        />
      ) : (
        <>
          {rising.length > 0 && (
            <Lane
              title="Rising ideas"
              blurb="New evidence has materially improved these archived ideas."
              rows={rising}
              onOpen={setOpenId}
              onToggleProtect={(id, value) => updateOverride(id, { protected: value })}
            />
          )}

          {pending.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> Proposed by Innovation AI
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Proposals never enter the rack and never authorise a build. John accepts or rejects each one.
                </p>
                {pending.map((r) => (
                  <div key={r.idea.id} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium text-foreground">{r.idea.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{r.idea.summary}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" onClick={() => acceptProposal(r.idea.id)}>Accept into Bike Rack</Button>
                      <Button size="sm" variant="outline" onClick={() => rejectProposal(r.idea.id)}>Reject</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {LANES.map((lane) => (
            <Lane
              key={lane.lifecycle}
              title={
                lane.lifecycle === "active"
                  ? `${LIFECYCLE_LABELS.active} (max ${ACTIVE_RACK_TARGET})`
                  : LIFECYCLE_LABELS[lane.lifecycle]
              }
              blurb={lane.blurb}
              rows={rows.filter((r) => r.placement.lifecycle === lane.lifecycle && !r.idea.proposalPending)}
              onOpen={setOpenId}
              onToggleProtect={(id, value) => updateOverride(id, { protected: value })}
            />
          ))}
        </>
      )}

      {!ready && <p className="text-sm text-muted-foreground">Loading saved evidence…</p>}

      <IdeaDetail
        row={open}
        onClose={() => setOpenId(null)}
        onAddEvidence={addEvidence}
        onTrack={(id, track) => updateOverride(id, { decisionTrack: track })}
        onWeeks={(id, weeks) => updateOverride(id, { timeToFirstDollarWeeks: weeks })}
      />
    </div>
  );
}

function Lane({
  title,
  blurb,
  rows,
  onOpen,
  onToggleProtect,
}: {
  title: string;
  blurb: string;
  rows: RankedIdea[];
  onOpen: (id: string) => void;
  onToggleProtect: (id: string, value: boolean) => void;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{blurb}</p>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Nothing here.
          </p>
        ) : (
          rows.map((r) => (
            <IdeaRow key={r.idea.id} row={r} onOpen={onOpen} onToggleProtect={onToggleProtect} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function IdeaRow({
  row,
  onOpen,
  onToggleProtect,
}: {
  row: RankedIdea;
  onOpen: (id: string) => void;
  onToggleProtect: (id: string, value: boolean) => void;
}) {
  const { idea, score, placement, history, trend } = row;
  const why = history[0]?.explanation ?? "No evidence attached yet — the score cannot be calculated.";
  return (
    <div className="rounded-lg border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpen(idea.id)}
              className="text-left text-sm font-semibold text-foreground underline-offset-2 hover:underline"
            >
              {idea.title}
            </button>
            <Badge variant="secondary" className="text-[11px]">{ORIGIN_LABELS[idea.origin]}</Badge>
            {idea.protected && <Badge className="text-[11px]">Protected by John</Badge>}
            {idea.decisionTrack && (
              <Badge variant="outline" className="text-[11px]">{DECISION_TRACK_LABELS[idea.decisionTrack]}</Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{idea.summary}</p>
        </div>
        <div className="flex items-center gap-2">
          <ScoreDial label="Score" value={score.opportunity} />
          <ScoreDial label="Confidence" value={score.confidence} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Trend direction={trend.direction} delta={trend.delta} />
        <span>{LIFECYCLE_LABELS[placement.lifecycle]}</span>
        <span>{score.evidenceCount} evidence item{score.evidenceCount === 1 ? "" : "s"}</span>
        <span>
          Last researched:{" "}
          {score.lastEvidenceDate ? score.lastEvidenceDate.slice(0, 10) : "never"}
        </span>
        <span>
          Time to first dollar:{" "}
          {idea.timeToFirstDollarWeeks ? `${idea.timeToFirstDollarWeeks} weeks (estimate)` : "not estimated"}
        </span>
        {score.decayPoints > 0 && <span>Stale: −{score.decayPoints} from decay</span>}
      </div>

      <p className="mt-2 text-xs">
        <span className="font-medium text-foreground">Why the score changed:</span>{" "}
        <span className="text-muted-foreground">{why}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{placement.reason}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onOpen(idea.id)}>
          Evidence trail &amp; breakdown
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onToggleProtect(idea.id, !idea.protected)}
        >
          {idea.protected ? (
            <><PinOff className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Unprotect</>
          ) : (
            <><Pin className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Protect</>
          )}
        </Button>
      </div>
    </div>
  );
}

const TRACKS: DecisionTrack[] = ["fast-revenue", "validate", "feasibility", "reject"];

function IdeaDetail({
  row,
  onClose,
  onAddEvidence,
  onTrack,
  onWeeks,
}: {
  row: RankedIdea | null;
  onClose: () => void;
  onAddEvidence: (record: EvidenceRecord) => void;
  onTrack: (id: string, track: DecisionTrack) => void;
  onWeeks: (id: string, weeks: number) => void;
}) {
  const [sourceType, setSourceType] = useState<EvidenceSourceType>("official-data");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState("");
  const [url, setUrl] = useState("");
  const [criterion, setCriterion] = useState<CriterionId>("demand");
  const [value, setValue] = useState(70);
  const [collectedBy, setCollectedBy] = useState("John");

  if (!row) return null;
  const { idea, score, history } = row;

  function submit() {
    if (!row) return;
    if (!summary.trim()) return;
    onAddEvidence({
      id: `ev-${Date.now()}`,
      ideaId: row.idea.id,
      date,
      sourceType,
      summary: summary.trim().slice(0, 800),
      sourceUrl: /^https?:\/\//i.test(url) ? url : undefined,
      collectedBy: collectedBy.trim() || "Unattributed",
      ratings: [{ criterion, value }],
    });
    setSummary("");
    setUrl("");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{idea.title}</DialogTitle>
          <DialogDescription>
            Score {score.opportunity ?? "—"} · Confidence {score.confidence} · {score.evidenceCount} evidence items ·
            evidence covers {score.coverage}% of the scoring criteria.
          </DialogDescription>
        </DialogHeader>

        <section>
          <h3 className="text-sm font-semibold text-foreground">Scoring breakdown</h3>
          {score.breakdown.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No criterion has evidence yet, so there is no score to break down.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {score.breakdown.map((b) => (
                <li key={b.criterion} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{b.label}</span>
                  <span className="tabular-nums text-foreground">
                    {b.value} <span className="text-muted-foreground">(weight {b.weight}, {b.evidenceCount} item{b.evidenceCount === 1 ? "" : "s"})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Criteria with no evidence are excluded from the score and lower the confidence rather than being guessed.
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-foreground">Evidence trail</h3>
          {history.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No evidence attached yet.</p>
          ) : (
            <ol className="mt-2 space-y-2">
              {history.map((h) => (
                <li key={`${h.at}-${h.triggeredBy}`} className="rounded-md border border-border p-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-foreground">{h.at.slice(0, 10)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      Score {h.opportunity ?? "—"} · Confidence {h.confidence}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{h.explanation}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-lg border border-border p-3">
          <h3 className="text-sm font-semibold text-foreground">Attach dated evidence</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Source type (sets reliability)</Label>
              <Select value={sourceType} onValueChange={(v) => setSourceType(v as EvidenceSourceType)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_TYPES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label} — {Math.round(s.reliability * 100)}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs" htmlFor="ev-date">Evidence date</Label>
              <Input id="ev-date" type="date" className="mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">What it measures</Label>
              <Select value={criterion} onValueChange={(v) => setCriterion(v as CriterionId)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CRITERIA.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                100 = {criterionById(criterion).highMeans}
              </p>
            </div>
            <div>
              <Label className="text-xs" htmlFor="ev-value">Rating this evidence supports (0–100)</Label>
              <Input
                id="ev-value"
                type="number"
                min={0}
                max={100}
                className="mt-1"
                value={value}
                onChange={(e) => setValue(Math.max(0, Math.min(100, Number(e.target.value || 0))))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs" htmlFor="ev-summary">What the evidence says</Label>
              <Textarea id="ev-summary" className="mt-1" value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs" htmlFor="ev-url">Source link (optional, http/https only)</Label>
              <Input id="ev-url" className="mt-1" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs" htmlFor="ev-by">Collected by</Label>
              <Input id="ev-by" className="mt-1" value={collectedBy} onChange={(e) => setCollectedBy(e.target.value)} />
            </div>
          </div>
          <Button className="mt-3" size="sm" onClick={submit} disabled={!summary.trim()}>
            Save evidence on this device
          </Button>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Source reliability applied: {Math.round(sourceTypeById(sourceType).reliability * 100)}%. Evidence text is
            stored and shown as plain text only; it is never treated as an instruction.
          </p>
        </section>

        <section className="rounded-lg border border-border p-3">
          <h3 className="text-sm font-semibold text-foreground">Decision Room</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Assigning a track records John's direction. It does not authorise any build or spending.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {TRACKS.map((t) => (
              <Button
                key={t}
                size="sm"
                variant={idea.decisionTrack === t ? "default" : "outline"}
                onClick={() => onTrack(idea.id, t)}
              >
                {DECISION_TRACK_LABELS[t]}
              </Button>
            ))}
          </div>
          <div className="mt-3 max-w-xs">
            <Label className="text-xs" htmlFor="ev-weeks">Estimated weeks to first revenue</Label>
            <Input
              id="ev-weeks"
              type="number"
              min={0}
              className="mt-1"
              value={idea.timeToFirstDollarWeeks ?? ""}
              onChange={(e) => onWeeks(idea.id, Math.max(0, Number(e.target.value || 0)))}
            />
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
