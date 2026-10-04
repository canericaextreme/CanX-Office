import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RoomShell } from "@/components/office/RoomShell";
import { skillStatusLabel } from "@/components/office/RoomSkillsLink";
import { Input } from "@/components/ui/input";
import {
  MASTER_SOURCE, OFFICE_SKILLS, ROOM_SKILL_MAP, SKILLS_REGISTRY_VERSION, STORAGE_DECISION, UNMATCHED_MASTER_ENTRIES,
  type OfficeSkill, type SkillKind,
} from "@/lib/office-skills";
import { OFFICE_MAP_ROOMS } from "@/lib/office-map";

export const Route = createFileRoute("/_office/skills")({
  head: () => ({
    meta: [
      { title: "CanX Office" },
      { name: "description", content: "Owner-only CanX operations workspace." },
      { property: "og:title", content: "CanX Office" },
      { property: "og:description", content: "Owner-only CanX operations workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Skills,
});

const GROUPS: Array<[SkillKind, string]> = [
  ["core", "Installed core skills (master build order)"],
  ["outline", "Installed named room instructions from the master map"],
  ["draft", "Installed actual-room instructions"],
  ["reserved", "Reserved"],
  ["legacy", "Legacy entries (history only)"],
];

function SkillDetail({ s }: { s: OfficeSkill }) {
  return (
    <details id={s.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
      <summary className="cursor-pointer text-sm">
        <span className="font-medium text-foreground">{s.buildOrder ? `${s.buildOrder}. ` : ""}{s.name}</span>
        <span className="text-xs text-muted-foreground"> · v{s.version} · {skillStatusLabel(s)}</span>
      </summary>
      <div className="mt-3 space-y-2 text-xs text-muted-foreground">
        <p><b className="text-foreground">Purpose:</b> {s.purpose}</p>
        <p><b className="text-foreground">Use when:</b> {s.useWhen}</p>
        {s.inputs.length > 0 && <p><b className="text-foreground">Allowed inputs:</b> {s.inputs.join("; ")}</p>}
        {s.steps.length > 0 && <div><b className="text-foreground">Steps:</b><ol className="ml-5 list-decimal">{s.steps.map((x) => <li key={x}>{x}</li>)}</ol></div>}
        {s.output.length > 0 && <p><b className="text-foreground">Output:</b> {s.output.join("; ")}</p>}
        <div><b className="text-foreground">Guardrails:</b><ul className="ml-5 list-disc">{s.guardrails.map((g) => <li key={g}>{g}</li>)}</ul></div>
        <p><b className="text-foreground">Yellow:</b> {s.status.yellow} <b className="text-foreground">Red:</b> {s.status.red} <b className="text-foreground">Return to green:</b> {s.status.returnToGreen}</p>
        <p><b className="text-foreground">Final check:</b> {s.finalCheck}</p>
        <p><b className="text-foreground">Owner approval:</b> {s.ownerApprovalRequired}</p>
        <p>
          <b className="text-foreground">Status:</b> instructions {s.instructionReady ? "ready" : "not written"} · inputs {s.toolConnected ? "connected" : "not all connected"} · routing {s.routingTested ? "tested" : "not tested"} · live use not yet tested
        </p>
        {s.connectedInputs.length > 0 && <p><b className="text-foreground">Connected:</b> {s.connectedInputs.join("; ")}</p>}
        {s.missingInputs.length > 0 && <p><b className="text-foreground">Missing:</b> {s.missingInputs.join("; ")}</p>}
        <p><b className="text-foreground">Rooms:</b> {s.routes.length ? s.routes.join(", ") : "none"} · <b className="text-foreground">Provenance:</b> {s.provenance}</p>
      </div>
    </details>
  );
}

function Skills() {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? OFFICE_SKILLS.filter((s) => `${s.name} ${s.masterRoom} ${s.purpose}`.toLowerCase().includes(t)) : OFFICE_SKILLS;
  }, [q]);
  return (
    <RoomShell title="Office Skills" purpose="The CanX-owned master copy of every office skill: instructions, status rules, approvals and sources." showSample={false}>
      <section className="mb-4 space-y-1 rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
        <p><b className="text-foreground">Registry version:</b> {SKILLS_REGISTRY_VERSION} · <b className="text-foreground">Source:</b> {MASTER_SOURCE}</p>
        <p><b className="text-foreground">Storage:</b> {STORAGE_DECISION}</p>
        <p>Part of <Link to="/family-continuity" className="text-primary hover:underline">Family Continuity, Skills &amp; Training</Link>. Elsie selects up to three matching task instructions per typed or spoken request; core safety instructions always apply. Installed instructions do not create connectors or live-test evidence. No skill runs on a schedule.</p>
      </section>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search skills" aria-label="Search skills" className="mb-4 max-w-sm" />
      {GROUPS.map(([kind, title]) => {
        const items = list.filter((s) => s.kind === kind);
        if (!items.length) return null;
        return (
          <section key={kind} className="mb-6">
            <h2 className="mb-2 text-sm font-semibold text-foreground">{title} ({items.length})</h2>
            <div className="space-y-2">{items.map((s) => <SkillDetail key={s.id} s={s} />)}</div>
          </section>
        );
      })}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Room coverage (19 numbered rooms)</h2>
        <ul className="grid gap-1 text-xs sm:grid-cols-2">
          {[...OFFICE_MAP_ROOMS].sort((a, b) => a.number.localeCompare(b.number)).map((r) => {
            const m = ROOM_SKILL_MAP[r.route];
            return (
              <li key={r.route} className="text-muted-foreground">
                <span className="font-medium text-foreground">{r.number} {r.label}</span> — {m ? `${m.coverage}${m.masterRooms.length ? ` (${m.masterRooms.join(", ")})` : ""}${m.note ? `. ${m.note}` : ""}` : "not mapped"}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Master entries without a numbered room: {UNMATCHED_MASTER_ENTRIES.map((u) => `${u.masterRoom} (${u.note})`).join("; ")}</p>
      </section>
    </RoomShell>
  );
}
