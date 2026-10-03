import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { WORK_STAGES, type Locator, type ProjectPlan } from "@/lib/project-locator";
import { OFFICE_ROOM_IDENTITIES } from "@/lib/office-room-identity";

const STAGE_LABEL: Record<string, string> = { unknown: "Not verified", planned: "Planned", building: "Building", blocked: "Blocked", testing: "Testing", ready: "Ready", market: "In market", completed: "Completed" };
const roomLabel = (route: string) => OFFICE_ROOM_IDENTITIES.find((r) => r.route === route)?.label ?? route;

/** Where a project is, its stage with evidence, tasks, blockers and the suggested next move; John can edit his plan. */
export function ProjectLocatorPanel({ loc, busy, onSave }: { loc: Locator; busy: boolean; onSave: (plan: Partial<ProjectPlan>) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ goal: loc.plan.goal, instructions: loc.plan.instructions, room: loc.plan.room, stage: loc.plan.stage ?? "", nextMove: loc.plan.nextMove, linked: loc.plan.linkedTaskIds.join(", ") });
  const field = "mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground";
  return (
    <div className="space-y-1.5 rounded-md border border-border/70 bg-background/40 p-2 text-xs">
      <p><span className="text-muted-foreground">Room:</span> <Link to={loc.room as "/projects"} className="font-medium text-primary hover:underline">{roomLabel(loc.room)}</Link> <span className="text-muted-foreground">({loc.roomBasis})</span></p>
      <p><span className="text-muted-foreground">Stage:</span> <strong className={loc.stage === "blocked" ? "text-destructive" : "text-foreground"}>{STAGE_LABEL[loc.stage]}</strong> — {loc.stageBasis}</p>
      <p><span className="text-muted-foreground">Goal:</span> {loc.plan.goal || <em>Not recorded — not verified</em>}</p>
      {loc.plan.instructions && <p className="line-clamp-3"><span className="text-muted-foreground">Your instructions:</span> {loc.plan.instructions}</p>}
      <p><span className="text-muted-foreground">Work Board:</span> {Object.entries(loc.taskCounts).map(([k, v]) => `${k.replace("_", " ")} ${v}`).join(", ") || "no linked tasks"}{loc.latestActivity ? ` · latest ${new Date(loc.latestActivity).toLocaleString()}` : ""} {loc.tasks.length > 0 && <Link to="/work-board" className="text-primary hover:underline">open</Link>}</p>
      {loc.tasks.slice(0, 4).map((t) => <p key={t.id} className="pl-2 text-muted-foreground">• {t.title} ({t.status.replace("_", " ")})</p>)}
      {loc.blockers.length > 0 && <p className="text-destructive">Blockers: {loc.blockers.join("; ")}</p>}
      <p><span className="text-muted-foreground">Next ({loc.nextBasis}):</span> <strong>{loc.nextMove}</strong> <span className="text-muted-foreground">— {loc.nextReason}</span></p>
      <p className="text-[11px] text-muted-foreground">A suggestion only; nothing is published, bought or launched from here.</p>
      {!editing ? (
        <Button size="sm" variant="outline" className="h-9" onClick={() => setEditing(true)}>Edit goal, room, stage and next move</Button>
      ) : (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); onSave({ goal: draft.goal, instructions: draft.instructions, room: draft.room, stage: (draft.stage || null) as ProjectPlan["stage"], nextMove: draft.nextMove, linkedTaskIds: draft.linked.split(/[\s,]+/).filter(Boolean) }); setEditing(false); }}>
          <label className="block">Goal<input className={field} value={draft.goal} maxLength={500} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} /></label>
          <label className="block">Your instructions<textarea className={field} rows={3} value={draft.instructions} maxLength={1500} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} /></label>
          <label className="block">Room<select className={field} value={draft.room} onChange={(e) => setDraft({ ...draft, room: e.target.value })}><option value="">From import ({roomLabel(loc.project.room)})</option>{OFFICE_ROOM_IDENTITIES.filter((r) => !r.reserved).map((r) => <option key={r.route} value={r.route}>{r.label}</option>)}</select></label>
          <label className="block">Stage<select className={field} value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value })}><option value="">Work it out from tasks</option>{WORK_STAGES.map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}</option>)}</select></label>
          <label className="block">Next move<input className={field} value={draft.nextMove} maxLength={400} placeholder="Leave empty for a suggestion" onChange={(e) => setDraft({ ...draft, nextMove: e.target.value })} /></label>
          <label className="block">Linked Work Board task IDs<input className={field} value={draft.linked} placeholder="Only tasks you have checked belong here" onChange={(e) => setDraft({ ...draft, linked: e.target.value })} /></label>
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={busy}>Save</Button><Button size="sm" type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
        </form>
      )}
    </div>
  );
}
