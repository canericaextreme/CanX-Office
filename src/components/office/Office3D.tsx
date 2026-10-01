"use client";

import { Link } from "@tanstack/react-router";
import {
  BarChart3, Bike, Building2, CheckCircle2, ClipboardList, CreditCard, Database,
  FileText, GraduationCap, HeartPulse, Landmark, Mail, Microscope, Network,
  Scale, ShieldCheck, Users, Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ApprovalIndicator } from "./ApprovalIndicator";

type OfficeMapRoom = {
  number: string;
  label: string;
  purpose: string;
  route: string;
  icon: LucideIcon;
  tone: "red" | "blue" | "purple" | "teal" | "cyan";
  span?: string;
};

const rooms: OfficeMapRoom[] = [
  { number: "01", label: "Reception", purpose: "Single point of instruction and next step.", route: "/", icon: Building2, tone: "red" },
  { number: "02", label: "Owner's Desk", purpose: "Decisions, red stops, priorities and cost.", route: "/owner-desk", icon: Landmark, tone: "red" },
  { number: "03", label: "Approvals", purpose: "Exact action, cost, risk and alternatives.", route: "/approvals", icon: CheckCircle2, tone: "red" },
  { number: "04", label: "Idea Garage & Bike Rack", purpose: "Ideas, contenders and decision table.", route: "/idea-garage", icon: Bike, tone: "red" },
  { number: "05", label: "Office Team", purpose: "Roles and capabilities.", route: "/office-team", icon: Users, tone: "blue" },
  { number: "06", label: "Records", purpose: "Files, decisions and sources.", route: "/records", icon: FileText, tone: "purple" },
  { number: "07", label: "Blueprint", purpose: "Plan, rooms and dependencies.", route: "/blueprint", icon: Network, tone: "purple" },
  { number: "17", label: "Research", purpose: "Research, options and recommendations.", route: "/research", icon: Microscope, tone: "purple" },
  { number: "18", label: "Training and Skills", purpose: "Approved procedures and training for consistent work.", route: "/skills", icon: GraduationCap, tone: "purple" },
  { number: "19", label: "Family Continuity", purpose: "Knowledge kept understandable and usable by the family.", route: "/family-continuity", icon: Users, tone: "purple" },
  { number: "14", label: "Work Board", purpose: "Tasks, blockers and priorities.", route: "/work-board", icon: ClipboardList, tone: "blue" },
  { number: "15", label: "Build and Testing", purpose: "Briefs, checks and release gates.", route: "/build-testing", icon: Wrench, tone: "blue" },
  { number: "16", label: "Safe Highways Project", purpose: "Programme and routing oversight.", route: "/safe-highways", icon: ShieldCheck, tone: "blue" },
  { number: "10", label: "Communications & Outreach", purpose: "Drafts, delivery and recipient checks.", route: "/communications", icon: Mail, tone: "teal" },
  { number: "11", label: "Legal", purpose: "Risks, agreements and compliance.", route: "/legal", icon: Scale, tone: "teal" },
  { number: "12", label: "Subscriptions", purpose: "Renewals, API use and alternatives.", route: "/subscriptions", icon: CreditCard, tone: "teal" },
  { number: "13", label: "Finance", purpose: "Income, expenses and receipts.", route: "/finance", icon: BarChart3, tone: "teal" },
  { number: "08", label: "Systems", purpose: "Connections, office health, backup and recovery.", route: "/systems", icon: Database, tone: "cyan", span: "xl:col-span-3" },
  { number: "09", label: "Office Health", purpose: "Systems, uptime and performance.", route: "/health", icon: HeartPulse, tone: "cyan", span: "xl:col-span-3" },
];

const toneClasses: Record<OfficeMapRoom["tone"], string> = {
  red: "border-rose-500/90 text-rose-300 shadow-rose-950/30",
  blue: "border-sky-500/90 text-sky-300 shadow-sky-950/30",
  purple: "border-violet-500/90 text-violet-300 shadow-violet-950/30",
  teal: "border-teal-400/90 text-teal-200 shadow-teal-950/30",
  cyan: "border-cyan-400/90 text-cyan-200 shadow-cyan-950/30",
};

function RoomCard({ room }: { room: OfficeMapRoom }) {
  const Icon = room.icon;
  return (
    <Link
      to={room.route}
      aria-label={`${room.label} — ${room.purpose}`}
      className={`group relative min-h-[178px] overflow-hidden rounded-xl border-2 bg-slate-950 shadow-xl transition duration-300 hover:z-20 hover:-translate-y-3 hover:scale-[1.06] hover:shadow-2xl focus-visible:z-20 focus-visible:-translate-y-3 focus-visible:scale-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${toneClasses[room.tone]} ${room.span ?? "xl:col-span-2"}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_25%,rgba(255,255,255,0.16),transparent_28%),linear-gradient(135deg,rgba(30,41,59,0.45),rgba(2,6,23,0.96))]" />
      <div className="absolute inset-x-5 bottom-5 h-12 rounded-sm border border-white/10 bg-slate-800/80 shadow-[0_14px_30px_rgba(0,0,0,0.7)] transition-transform duration-300 group-hover:scale-105">
        <div className="absolute -top-9 left-5 h-9 w-16 rounded-t border border-white/10 bg-slate-900 shadow-[inset_0_0_16px_rgba(56,189,248,0.22)]" />
        <div className="absolute -top-7 right-7 h-7 w-12 rounded-t border border-white/10 bg-slate-900 shadow-[inset_0_0_14px_rgba(168,85,247,0.2)]" />
        <div className="absolute -bottom-3 left-9 h-4 w-8 rounded-b bg-slate-700" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/25 via-slate-950/20 to-slate-950/80" />
      <div className="relative flex h-full min-h-[178px] flex-col p-3.5">
        <div className="flex items-start gap-3">
          <span className="rounded-full border-2 border-current bg-slate-950/85 px-3 py-0.5 text-sm font-black tracking-wide">{room.number}</span>
          <div className="min-w-0">
            <h3 className="text-[17px] font-bold leading-tight text-white">{room.label}</h3>
            <p className="mt-1 max-w-[230px] text-sm leading-snug text-slate-200">{room.purpose}</p>
          </div>
        </div>
        <span className="mt-auto ml-auto flex h-11 w-11 items-center justify-center rounded-full border-2 border-current bg-slate-950/90 shadow-lg"><Icon className="h-5 w-5" aria-hidden="true" /></span>
        {room.route === "/approvals" && <ApprovalIndicator />}
      </div>
      <div className="pointer-events-none absolute inset-x-3 bottom-2 translate-y-5 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-80 group-focus-visible:translate-y-0 group-focus-visible:opacity-80">Open room</div>
    </Link>
  );
}

export function Office3D() {
  return (
    <section aria-labelledby="office-scene-title" className="rounded-2xl border border-slate-700/80 bg-[#030817] p-4 shadow-2xl sm:p-5">
      <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="office-scene-title" className="text-2xl font-black tracking-tight text-white sm:text-3xl">The CanX Office — 19 rooms, one coordinated system.</h2>
          <p className="mt-1 text-sm text-slate-300">Choose a room to enter. Point to a room to bring it forward and see what it does.</p>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Private owner review</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-10">{rooms.map((room) => <RoomCard key={room.number} room={room} />)}</div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Link to="/analytics" className="group flex min-h-[104px] items-center gap-5 rounded-xl border-2 border-orange-500 bg-[linear-gradient(100deg,rgba(58,24,8,0.92),rgba(88,36,12,0.72),rgba(15,23,42,0.96))] px-5 py-4 shadow-lg shadow-orange-950/30 transition duration-300 hover:-translate-y-1 hover:scale-[1.01] hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-orange-400 bg-slate-950/70 text-orange-300"><BarChart3 className="h-7 w-7" /></span>
          <div><h3 className="text-2xl font-bold text-white">Analytics</h3><p className="mt-1 text-sm text-orange-100/90">Revenue · expenses · profit/loss · progress · workload · growth · subscriptions · Safe Highways</p></div>
        </Link>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("canx:open-manager"))} className="flex min-h-[104px] items-center justify-center gap-4 rounded-full border border-rose-300/30 bg-gradient-to-r from-rose-700 to-rose-500 px-6 text-xl font-black text-white shadow-[0_0_30px_rgba(244,63,94,0.48)] transition hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-950/55 text-lg">A</span>Talk to Astra
        </button>
      </div>
    </section>
  );
}
