import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, BarChart3, Bot, Clock3, Coins, FolderKanban, ShieldCheck, AlertTriangle, ArrowLeft, Gauge, TrendingUp, RefreshCcw, ChevronRight } from "lucide-react";
import { RoomSkillsLink } from "@/components/office/RoomSkillsLink";
import { OfficeFiles } from "@/components/office/OfficeFiles";

export const Route = createFileRoute("/_office/analytics")({ component: AnalyticsRoom });

type Tile = { id: string; title: string; subtitle: string; accent: string; Icon: typeof Activity; source: string; details: string[]; action: string };
const TILES: Tile[] = [
  { id:"spend",title:"Spending & Budget",subtitle:"C$500 Office / C$100 Manager AI",accent:"orange",Icon:Coins,source:"Finance and approved budget records",details:["Total Office budget: C$500 per month (policy, not a verified balance).","Office Manager AI sub-budget: C$100 per month (policy).","Show real spend, top vendors and estimated run-out only when linked billing evidence is available.","Warn before renewal, credit exhaustion and unusual cost changes."],action:"Connect verified subscription and provider cost evidence before displaying totals." },
  { id:"credits",title:"API Credits",subtitle:"Balances & usage",accent:"lime",Icon:Gauge,source:"Provider billing APIs (not yet wired)",details:["Compare providers by usage, cost per successful build and consumption trend.","Show remaining credit and projected exhaustion only when account data is verified.","Show a dated yellow warning before credit limits or budget thresholds."],action:"Configure owner-approved read-only provider telemetry." },
  { id:"builders",title:"Builder Performance",subtitle:"Claude · ChatGPT / Codex",accent:"blue",Icon:Bot,source:"GitHub Actions + Work Board receipts",details:["Completed, failed, pending and running builds by named builder.","Assignments by John versus handoffs originating with Elsie.","Successful build costs, review time and elapsed time require consistent provenance.","A passing build is not proof of a deployed release."],action:"Instrument task-origin and workflow receipt joins." },
  { id:"projects",title:"Projects & Launch",subtitle:"Progress and readiness",accent:"lime",Icon:FolderKanban,source:"Work Board and project register",details:["Show milestones, blockers, delivery readiness and evidence for each project.","Safe Highways, Trails & Tales, books and Idea Garage remain separate projects.","Do not infer percent complete from titles or draft plans."],action:"Connect verified milestones and completed task evidence." },
  { id:"time",title:"Time Management",subtitle:"Build time · waiting time",accent:"blue",Icon:Clock3,source:"Task events and GitHub run timestamps",details:["Separate elapsed calendar time from actual recorded build execution.","Break down queue wait, build runtime, review, failed attempts and deployment delay.","Compare before/after changes to measure time saved."],action:"Link task timestamps to actual run and review events." },
  { id:"health",title:"Office Health",subtitle:"Services, backup & rollback",accent:"lime",Icon:ShieldCheck,source:"Office Health checks and verified release records",details:["Only successful health probes can show a green indicator.","Security, backup recoverability and rollback need dated tests.","Unreadable status must be labeled unknown, not healthy."],action:"Connect read-only verification results; preserve security rules." },
  { id:"bottlenecks",title:"Efficiency & Improvements",subtitle:"Stuck work and suggested fixes",accent:"orange",Icon:TrendingUp,source:"Work Board blockers and Research findings",details:["Rank evidenced bottlenecks, failed handoffs and stale tasks.","Elsie can explain each proposed improvement and consult Claude or ChatGPT using authorized channels.","Track the baseline, proposed remedy, cost, approval, and verified outcome."],action:"Review the top three verified bottlenecks with Elsie." },
  { id:"alerts",title:"Top Three Actions",subtitle:"Owner attention and deadlines",accent:"orange",Icon:AlertTriangle,source:"Approvals, task blockers, renewal evidence",details:["Show no more than three urgent and verified next actions.","Highlight impending renewals, credit limits and security exceptions.","Never create approvals, payments or builder runs merely by displaying an alert."],action:"Refresh evidence from approved sources." }
];
const BORDERS: Record<string,string> = {blue:"border-cyan-400/70 shadow-cyan-500/15 text-cyan-300",lime:"border-lime-400/70 shadow-lime-500/15 text-lime-300",orange:"border-orange-400/70 shadow-orange-500/15 text-orange-300"};
function AnalyticsRoom(){
  const [selected,setSelected]=useState<string|null>(null);
  const tile=TILES.find(t=>t.id===selected);
  return <main className="min-h-screen bg-[#07111a] text-white px-4 py-5 md:px-6">
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs uppercase tracking-[.24em] text-lime-300">CanX • Office control</p><h1 className="text-2xl font-bold md:text-3xl">Analytics <span className="text-cyan-300">Command Centre</span></h1><p className="mt-1 text-sm text-slate-300">One view of costs, people, progress and problems. Select a card for details.</p></div>
        <div className="flex items-center gap-2"><span className="rounded-full border border-orange-400/50 bg-orange-400/10 px-3 py-1.5 text-xs text-orange-200">DRAFT • Live metrics not connected</span><RoomSkillsLink route="/analytics"/></div>
      </div>
      <div className="mt-4 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-[#0c2634] via-[#09212c] to-[#102519] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Activity className="h-7 w-7 text-lime-300"/><div><div className="font-bold">Overall Office Health: Not verified</div><div className="text-xs text-slate-300">Unknown means not checked, never assumed green</div></div></div><div className="flex items-center gap-2 text-xs text-cyan-200"><RefreshCcw className="h-4 w-4"/> Data freshness: connection pending</div></div>
      </div>
      <section aria-label="Analytics overview" className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      {TILES.map(t=><button key={t.id} type="button" onClick={()=>setSelected(t.id)} className={"min-h-[150px] rounded-xl border bg-[#091923]/95 p-4 text-left shadow-lg transition hover:-translate-y-0.5 hover:bg-[#102b35] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white "+BORDERS[t.accent]}>
          <div className="flex items-start justify-between"><t.Icon className="h-7 w-7"/><ChevronRight className="h-4 w-4 text-slate-400"/></div>
          <div className="mt-3 font-semibold text-white">{t.title}</div><div className="mt-1 text-sm text-slate-300">{t.subtitle}</div><div className="mt-3 text-xs text-amber-300">Data not connected — open details</div>
      </button>)}
      </section>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border border-cyan-400/35 bg-[#0a202b] p-4"><h2 className="flex items-center gap-2 font-semibold"><BarChart3 className="h-5 w-5 text-cyan-300"/> Trend charts</h2><p className="mt-2 text-sm text-slate-300">Build volume, expenses and project movement appear here after sources are connected. We will not draw invented trend lines.</p><div className="mt-4 flex h-16 items-center justify-center rounded-lg border border-dashed border-cyan-500/30 text-sm text-cyan-200">Awaiting verified dated measurements</div></section>
        <section className="relative overflow-hidden rounded-xl border border-lime-400/30 bg-gradient-to-br from-[#0b2830] via-[#153231] to-[#173a20] p-4">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[.12]" style={{backgroundImage:"linear-gradient(145deg,transparent 35%,#95f5df 48%,transparent 49%,#79a9d7 54%,transparent 63%)"}}/>
          <div className="relative"><h2 className="font-semibold text-lime-200">A safer Canada, together</h2><p className="mt-2 max-w-md text-sm text-slate-200">Safe Highways project status belongs here only when verified. Subtle highway-inspired artwork stays behind readable metrics.</p><p className="mt-3 text-xs text-amber-200">Project telemetry not connected</p></div>
        </section>
      </div>
      <div className="mt-4"><OfficeFiles room="analytics"/></div>
    </div>
    {tile && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3" onClick={()=>setSelected(null)}>
      <section role="dialog" aria-modal="true" aria-label={tile.title+" details"} onClick={e=>e.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-cyan-400/50 bg-[#091922] p-5 text-white shadow-2xl">
        <button onClick={()=>setSelected(null)} className="mb-4 inline-flex items-center gap-2 rounded-lg border border-slate-500 px-3 py-2 text-sm hover:bg-slate-800"><ArrowLeft className="h-4 w-4"/> Back to overview</button>
        <div className="flex items-center gap-3"><tile.Icon className={"h-8 w-8 "+(tile.accent === "blue" ? "text-cyan-300" : tile.accent === "lime" ? "text-lime-300" : "text-orange-300")}/><h2 className="text-2xl font-bold">{tile.title}</h2></div>
        <p className="mt-3 rounded-md bg-orange-400/10 p-3 text-sm text-orange-200">Status: not connected. No invented figures.</p>
        <h3 className="mt-5 font-semibold text-cyan-200">What this means</h3><p className="mt-2 text-sm text-slate-300">This card is one instrument on the Office dashboard. Elsie can explain its purpose and what evidence is missing in simple language.</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-200">{tile.details.map(x=><li key={x}>{x}</li>)}</ul>
        <p className="mt-5 text-sm"><strong className="text-lime-300">Source:</strong> {tile.source}</p><p className="mt-2 text-sm"><strong className="text-orange-300">Next step:</strong> {tile.action}</p>
      </section>
    </div>}
  </main>;
}
