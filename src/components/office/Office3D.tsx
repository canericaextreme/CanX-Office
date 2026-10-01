"use client";

import { Link } from "@tanstack/react-router";
import {
  BarChart3, Bike, Brain, Building2, CheckCircle2, ClipboardList, CreditCard,
  Database, FileText, GraduationCap, HeartPulse, Landmark, Mail, Microscope,
  Network, Scale, ShieldCheck, Users, Wrench,
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
};

const rooms: OfficeMapRoom[] = [
  { number: "01", label: "Reception", purpose: "Instructions and next steps", route: "/", icon: Building2, tone: "red" },
  { number: "02", label: "Owner's Desk", purpose: "Decisions, priorities and cost", route: "/owner-desk", icon: Landmark, tone: "red" },
  { number: "03", label: "Approvals", purpose: "Actions, risk and alternatives", route: "/approvals", icon: CheckCircle2, tone: "red" },
  { number: "04", label: "Idea Garage & Bike Rack", purpose: "Ideas and decision table", route: "/idea-garage", icon: Bike, tone: "red" },
  { number: "05", label: "Office Team", purpose: "Roles and capabilities", route: "/office-team", icon: Users, tone: "blue" },
  { number: "06", label: "Records", purpose: "Files, decisions and sources", route: "/records", icon: FileText, tone: "purple" },
  { number: "07", label: "Blueprint", purpose: "Plans, rooms and dependencies", route: "/blueprint", icon: Network, tone: "purple" },
  { number: "08", label: "Systems", purpose: "Connections, backup and recovery", route: "/systems", icon: Database, tone: "cyan" },
  { number: "09", label: "Office Health", purpose: "Uptime and performance", route: "/health", icon: HeartPulse, tone: "cyan" },
  { number: "10", label: "Communications & Outreach", purpose: "Drafts and delivery", route: "/communications", icon: Mail, tone: "teal" },
  { number: "11", label: "Legal", purpose: "Risk, agreements and compliance", route: "/legal", icon: Scale, tone: "teal" },
  { number: "12", label: "Subscriptions", purpose: "Renewals, use and alternatives", route: "/subscriptions", icon: CreditCard, tone: "teal" },
  { number: "13", label: "Finance", purpose: "Income, expenses and receipts", route: "/finance", icon: BarChart3, tone: "teal" },
  { number: "14", label: "Work Board", purpose: "Tasks, blockers and priorities", route: "/work-board", icon: ClipboardList, tone: "blue" },
  { number: "15", label: "Build & Testing", purpose: "Briefs, checks and releases", route: "/build-testing", icon: Wrench, tone: "blue" },
  { number: "16", label: "Safe Highways Project", purpose: "Programme and routing oversight", route: "/safe-highways", icon: ShieldCheck, tone: "blue" },
  { number: "17", label: "Research", purpose: "Evidence, options and advice", route: "/research", icon: Microscope, tone: "purple" },
  { number: "18", label: "Training & Skills", purpose: "Approved working procedures", route: "/skills", icon: GraduationCap, tone: "purple" },
  { number: "19", label: "Family Continuity", purpose: "Knowledge the family can use", route: "/family-continuity", icon: Users, tone: "purple" },
];

const byNumber = (numbers: string[]) => numbers.map((number) => rooms.find((room) => room.number === number)!);
const executiveRooms = byNumber(["02", "03", "04", "05"]);
const knowledgeRooms = byNumber(["06", "07", "17", "18", "19"]);
const operationsRooms = byNumber(["08", "09", "14", "15", "16"]);
const businessRooms = byNumber(["10", "11", "12", "13"]);
const reception = rooms.find((room) => room.number === "01")!;

const toneClasses: Record<OfficeMapRoom["tone"], string> = {
  red: "border-rose-500/90 shadow-rose-950/50 group-hover:border-rose-300",
  blue: "border-sky-500/90 shadow-sky-950/50 group-hover:border-sky-300",
  purple: "border-violet-500/90 shadow-violet-950/50 group-hover:border-violet-300",
  teal: "border-teal-400/90 shadow-teal-950/50 group-hover:border-teal-200",
  cyan: "border-cyan-400/90 shadow-cyan-950/50 group-hover:border-cyan-200",
};

function Room({ room }: { room: OfficeMapRoom }) {
  const Icon = room.icon;
  return (
    <Link
      to={room.route}
      aria-label={`${room.label} — ${room.purpose}`}
      className={`group relative min-h-[132px] overflow-visible border-2 bg-[#091120] shadow-lg transition duration-300 hover:z-30 hover:-translate-y-2 hover:scale-[1.08] hover:bg-[#0d192b] hover:shadow-2xl focus-visible:z-30 focus-visible:-translate-y-2 focus-visible:scale-[1.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${toneClasses[room.tone]}`}
    >
      <div className="absolute inset-2 border border-white/5 bg-[linear-gradient(145deg,rgba(30,41,59,.45),rgba(2,6,23,.85))]" />
      <div className="absolute bottom-3 left-4 right-4 h-8 border border-white/10 bg-slate-800/90 shadow-[0_8px_14px_rgba(0,0,0,.65)]">
        <span className="absolute -top-5 left-3 h-5 w-9 border border-white/10 bg-slate-900" />
        <span className="absolute -top-4 right-3 h-4 w-7 border border-white/10 bg-slate-900" />
      </div>
      <div className="absolute -bottom-[2px] left-1/2 h-3 w-9 -translate-x-1/2 border-x-2 border-t-2 border-amber-200/70 bg-[#162033]" aria-hidden="true" />
      <div className="relative flex min-h-[132px] flex-col p-3">
        <div className="flex items-start gap-2">
          <span className="rounded-full border border-current bg-slate-950/90 px-2 py-0.5 text-xs font-black text-white">{room.number}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold leading-tight text-white">{room.label}</h3>
            <p className="mt-1 text-xs leading-snug text-slate-300">{room.purpose}</p>
          </div>
        </div>
        <span className="mt-auto ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-slate-950/90 text-white"><Icon className="h-4 w-4" aria-hidden="true" /></span>
        {room.route === "/approvals" && <ApprovalIndicator />}
      </div>
      <div className="pointer-events-none absolute inset-x-1 top-full mt-2 rounded bg-black/95 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-white opacity-0 shadow-xl transition group-hover:opacity-100 group-focus-visible:opacity-100">Click to enter</div>
    </Link>
  );
}

function Wing({ name, subtitle, rooms: wingRooms }: { name: string; subtitle: string; rooms: OfficeMapRoom[] }) {
  return (
    <section className="relative border-4 border-slate-500/80 bg-[#111827] p-2 shadow-[inset_0_0_35px_rgba(0,0,0,.7)]">
      <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-slate-600 pb-1.5">
        <h2 className="text-xs font-black uppercase tracking-[0.18em] text-white">{name}</h2>
        <p className="text-[10px] text-slate-400">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{wingRooms.map((room) => <Room key={room.number} room={room} />)}</div>
    </section>
  );
}

function CentralHall() {
  return (
    <div className="relative flex min-h-[720px] flex-col items-center border-x-4 border-amber-200/55 bg-[repeating-linear-gradient(0deg,#263244_0,#263244_34px,#2c394c_35px,#2c394c_36px)] px-3 py-5 shadow-[inset_18px_0_25px_rgba(0,0,0,.2),inset_-18px_0_25px_rgba(0,0,0,.2)]">
      <p className="text-center text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/80">Central Hall</p>
      <div className="mt-12 h-12 w-px bg-amber-100/40" />
      <Link to="/brain" className="group relative flex h-36 w-36 flex-col items-center justify-center rounded-full border-4 border-cyan-300 bg-[radial-gradient(circle,#164e63,#07111f_68%)] text-center text-white shadow-[0_0_38px_rgba(34,211,238,.35)] transition hover:scale-110 hover:shadow-[0_0_55px_rgba(34,211,238,.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
        <Brain className="h-9 w-9 text-cyan-200" />
        <strong className="mt-2 text-sm">CanX Brain</strong>
        <span className="mt-1 text-[10px] text-cyan-100/75">Shared memory core</span>
      </Link>
      <div className="my-6 flex flex-1 flex-col items-center justify-center gap-5 text-center text-[9px] font-bold uppercase tracking-[0.18em] text-slate-300/70">
        <span>Knowledge wing ←</span>
        <span>→ Operations wing</span>
        <span>Executive wing ←</span>
        <span>→ Business wing</span>
      </div>
      <div className="w-full"><Room room={reception} /></div>
      <span className="mt-3 rounded-t-full border-x-2 border-t-2 border-amber-200/70 px-5 pt-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-100">Main entrance</span>
    </div>
  );
}

export function Office3D() {
  return (
    <main className="min-h-screen bg-[#020611] px-3 py-5 text-white sm:px-5">
      <header className="mx-auto mb-4 flex max-w-[1600px] flex-col gap-3 rounded-xl border border-slate-700 bg-[#0a101c] px-5 py-4 shadow-xl lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-rose-400">CanX Office</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">19 rooms. One working office.</h1>
          <p className="mt-1 text-sm text-slate-300">Point to a room for its furnished preview. Click the room to enter.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-amber-300/40 bg-amber-950/30 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-amber-200">Private owner review</span>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("canx:open-manager"))} className="rounded-full border border-rose-300/40 bg-gradient-to-r from-rose-700 to-rose-500 px-5 py-3 text-sm font-black text-white shadow-[0_0_24px_rgba(244,63,94,.38)] transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Talk to Astra</button>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] overflow-visible rounded-2xl border-[6px] border-slate-600 bg-[#070c15] p-3 shadow-[0_24px_70px_rgba(0,0,0,.65)]">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)]">
          <div className="grid content-start gap-3">
            <Wing name="Knowledge Wing" subtitle="Records · plans · research" rooms={knowledgeRooms} />
            <Wing name="Executive Wing" subtitle="Direction · decisions" rooms={executiveRooms} />
          </div>
          <CentralHall />
          <div className="grid content-start gap-3">
            <Wing name="Operations Wing" subtitle="Systems · delivery · health" rooms={operationsRooms} />
            <Wing name="Business Wing" subtitle="Legal · finance · outreach" rooms={businessRooms} />
          </div>
        </div>

        <Link to="/analytics" className="group mt-3 flex min-h-[92px] items-center gap-4 border-2 border-orange-400 bg-[linear-gradient(100deg,#4a1d08,#7c2d12,#111827)] px-5 py-3 shadow-[0_0_25px_rgba(249,115,22,.18)] transition hover:-translate-y-1 hover:border-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-orange-300 bg-black/35 text-orange-200"><BarChart3 className="h-6 w-6" /></span>
          <div><h2 className="text-lg font-black text-white">Analytics Control Wall</h2><p className="mt-0.5 text-xs text-orange-100/85">Revenue · expenses · progress · workload · subscriptions · Safe Highways</p></div>
          <span className="ml-auto hidden text-xs font-black uppercase tracking-[0.18em] text-orange-200 sm:block">Open panel →</span>
        </Link>
      </div>
    </main>
  );
}
