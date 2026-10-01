"use client";

import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  Bike,
  Brain,
  Building2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Database,
  FileText,
  GraduationCap,
  HeartPulse,
  Landmark,
  Mail,
  Microscope,
  Network,
  Scale,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ApprovalIndicator } from "./ApprovalIndicator";

type RoomTone = "red" | "blue" | "purple" | "teal" | "cyan";
type Furnishing =
  | "desk"
  | "meeting"
  | "garage"
  | "team"
  | "archive"
  | "blueprint"
  | "servers"
  | "health"
  | "communications"
  | "legal"
  | "finance"
  | "workboard"
  | "build"
  | "highways"
  | "research"
  | "training"
  | "lounge"
  | "reception";

type OfficeMapRoom = {
  number: string;
  label: string;
  purpose: string;
  route: string;
  icon: LucideIcon;
  tone: RoomTone;
  furnishing: Furnishing;
  placement: string;
};

const rooms: OfficeMapRoom[] = [
  {
    number: "06",
    label: "Records",
    purpose: "Files, decisions and sources",
    route: "/records",
    icon: FileText,
    tone: "purple",
    furnishing: "archive",
    placement: "col-span-3 row-start-1",
  },
  {
    number: "07",
    label: "Blueprint",
    purpose: "Plans, rooms and dependencies",
    route: "/blueprint",
    icon: Network,
    tone: "purple",
    furnishing: "blueprint",
    placement: "col-span-3 col-start-4 row-start-1",
  },
  {
    number: "17",
    label: "Research",
    purpose: "Evidence, options and advice",
    route: "/research",
    icon: Microscope,
    tone: "purple",
    furnishing: "research",
    placement: "col-span-3 col-start-7 row-start-1",
  },
  {
    number: "18",
    label: "Training & Skills",
    purpose: "Approved working procedures",
    route: "/skills",
    icon: GraduationCap,
    tone: "purple",
    furnishing: "training",
    placement: "col-span-3 col-start-10 row-start-1",
  },

  {
    number: "19",
    label: "Family Continuity",
    purpose: "Knowledge the family can use",
    route: "/family-continuity",
    icon: Users,
    tone: "purple",
    furnishing: "lounge",
    placement: "col-span-2 row-start-3",
  },
  {
    number: "05",
    label: "Office Team",
    purpose: "Roles and capabilities",
    route: "/office-team",
    icon: Users,
    tone: "blue",
    furnishing: "team",
    placement: "col-span-2 col-start-3 row-start-3",
  },
  {
    number: "08",
    label: "Systems",
    purpose: "Connections, backup and recovery",
    route: "/systems",
    icon: Database,
    tone: "cyan",
    furnishing: "servers",
    placement: "col-span-3 col-start-7 row-start-3",
  },
  {
    number: "09",
    label: "Office Health",
    purpose: "Uptime and performance",
    route: "/health",
    icon: HeartPulse,
    tone: "cyan",
    furnishing: "health",
    placement: "col-span-3 col-start-10 row-start-3",
  },

  {
    number: "02",
    label: "Owner's Desk",
    purpose: "Decisions, priorities and cost",
    route: "/owner-desk",
    icon: Landmark,
    tone: "red",
    furnishing: "desk",
    placement: "col-span-2 row-start-5",
  },
  {
    number: "03",
    label: "Approvals",
    purpose: "Actions, risk and alternatives",
    route: "/approvals",
    icon: CheckCircle2,
    tone: "red",
    furnishing: "meeting",
    placement: "col-span-2 col-start-3 row-start-5",
  },
  {
    number: "04",
    label: "Idea Garage & Bike Rack",
    purpose: "Ideas and decision table",
    route: "/idea-garage",
    icon: Bike,
    tone: "red",
    furnishing: "garage",
    placement: "col-span-3 col-start-5 row-start-5",
  },
  {
    number: "14",
    label: "Work Board",
    purpose: "Tasks, blockers and priorities",
    route: "/work-board",
    icon: ClipboardList,
    tone: "blue",
    furnishing: "workboard",
    placement: "col-span-2 col-start-8 row-start-5",
  },
  {
    number: "15",
    label: "Build & Testing",
    purpose: "Briefs, checks and releases",
    route: "/build-testing",
    icon: Wrench,
    tone: "blue",
    furnishing: "build",
    placement: "col-span-3 col-start-10 row-start-5",
  },

  {
    number: "10",
    label: "Communications",
    purpose: "Drafts and delivery",
    route: "/communications",
    icon: Mail,
    tone: "teal",
    furnishing: "communications",
    placement: "col-span-2 row-start-7",
  },
  {
    number: "11",
    label: "Legal",
    purpose: "Risk, agreements and compliance",
    route: "/legal",
    icon: Scale,
    tone: "teal",
    furnishing: "legal",
    placement: "col-span-2 col-start-3 row-start-7",
  },
  {
    number: "01",
    label: "Reception",
    purpose: "Instructions and next steps",
    route: "/",
    icon: Building2,
    tone: "red",
    furnishing: "reception",
    placement: "col-span-2 col-start-5 row-start-7",
  },
  {
    number: "16",
    label: "Safe Highways",
    purpose: "Programme and routing oversight",
    route: "/safe-highways",
    icon: ShieldCheck,
    tone: "blue",
    furnishing: "highways",
    placement: "col-span-2 col-start-7 row-start-7",
  },
  {
    number: "12",
    label: "Subscriptions",
    purpose: "Renewals, use and alternatives",
    route: "/subscriptions",
    icon: CreditCard,
    tone: "teal",
    furnishing: "finance",
    placement: "col-span-2 col-start-9 row-start-7",
  },
  {
    number: "13",
    label: "Finance",
    purpose: "Income, expenses and receipts",
    route: "/finance",
    icon: BarChart3,
    tone: "teal",
    furnishing: "finance",
    placement: "col-span-2 col-start-11 row-start-7",
  },
];

const toneClasses: Record<RoomTone, string> = {
  red: "border-rose-500/90 shadow-rose-950/50 group-hover:border-rose-200",
  blue: "border-sky-500/90 shadow-sky-950/50 group-hover:border-sky-200",
  purple: "border-violet-500/90 shadow-violet-950/50 group-hover:border-violet-200",
  teal: "border-teal-400/90 shadow-teal-950/50 group-hover:border-teal-100",
  cyan: "border-cyan-400/90 shadow-cyan-950/50 group-hover:border-cyan-100",
};

function DeskFurniture() {
  return (
    <>
      <span className="absolute bottom-5 left-1/2 h-7 w-[56%] -translate-x-1/2 rounded-sm border border-amber-100/20 bg-amber-950/80 shadow-lg" />
      <span className="absolute bottom-[46px] left-1/2 h-7 w-10 -translate-x-1/2 rounded-sm border border-cyan-200/30 bg-slate-950 shadow-[0_0_10px_rgba(34,211,238,.16)]" />
      <span className="absolute bottom-1 left-1/2 h-6 w-7 -translate-x-1/2 rounded-t-full border border-slate-400/30 bg-slate-800" />
    </>
  );
}

function RoomFurnishings({ type }: { type: Furnishing }) {
  if (type === "servers")
    return (
      <>
        <span className="absolute bottom-3 left-[18%] top-12 w-[22%] border border-cyan-200/20 bg-slate-950 shadow-[inset_0_0_0_5px_#111827]" />
        <span className="absolute bottom-3 right-[18%] top-12 w-[22%] border border-cyan-200/20 bg-slate-950 shadow-[inset_0_0_0_5px_#111827]" />
        <span className="absolute left-[23%] right-[23%] top-[57%] h-px bg-cyan-300/50" />
      </>
    );
  if (type === "archive" || type === "legal")
    return (
      <>
        <span className="absolute bottom-3 left-3 top-12 w-8 border border-amber-100/15 bg-[repeating-linear-gradient(0deg,#1e293b_0,#1e293b_9px,#64748b_10px)]" />
        <span className="absolute bottom-3 right-3 top-12 w-8 border border-amber-100/15 bg-[repeating-linear-gradient(0deg,#1e293b_0,#1e293b_9px,#64748b_10px)]" />
        <DeskFurniture />
      </>
    );
  if (type === "garage")
    return (
      <>
        <span className="absolute bottom-4 left-[16%] h-11 w-11 rounded-full border-[3px] border-slate-300/60" />
        <span className="absolute bottom-4 left-[37%] h-11 w-11 rounded-full border-[3px] border-slate-300/60" />
        <span className="absolute bottom-9 left-[21%] h-0.5 w-[24%] -rotate-12 bg-rose-300/70" />
        <span className="absolute bottom-4 right-[10%] h-8 w-[34%] border border-amber-100/20 bg-rose-950/70" />
      </>
    );
  if (type === "meeting" || type === "team" || type === "training")
    return (
      <>
        <span className="absolute bottom-6 left-1/2 h-9 w-[62%] -translate-x-1/2 rounded-[50%] border border-amber-100/20 bg-amber-950/70" />
        <span className="absolute bottom-2 left-[29%] h-5 w-5 rounded-full border border-slate-300/30 bg-slate-800" />
        <span className="absolute bottom-2 right-[29%] h-5 w-5 rounded-full border border-slate-300/30 bg-slate-800" />
        <span className="absolute bottom-[54px] left-[29%] h-5 w-5 rounded-full border border-slate-300/30 bg-slate-800" />
        <span className="absolute bottom-[54px] right-[29%] h-5 w-5 rounded-full border border-slate-300/30 bg-slate-800" />
      </>
    );
  if (type === "lounge")
    return (
      <>
        <span className="absolute bottom-5 left-[12%] h-10 w-[35%] rounded-md border border-violet-200/20 bg-violet-950/70" />
        <span className="absolute bottom-5 right-[12%] h-10 w-[27%] rounded-md border border-violet-200/20 bg-violet-950/70" />
        <span className="absolute bottom-4 left-1/2 h-7 w-9 -translate-x-1/2 rounded-full border border-amber-100/20 bg-amber-950/70" />
      </>
    );
  if (type === "reception")
    return (
      <>
        <span className="absolute bottom-5 left-[8%] right-[8%] h-10 rounded-t-[45%] border-2 border-rose-300/30 bg-rose-950/85 shadow-lg" />
        <span className="absolute bottom-1 left-1/2 h-3 w-[38%] -translate-x-1/2 rounded-full bg-rose-500/20" />
        <span className="absolute bottom-[43px] left-1/2 h-6 w-8 -translate-x-1/2 border border-cyan-100/20 bg-slate-950" />
      </>
    );
  if (type === "highways")
    return (
      <>
        <span className="absolute left-[12%] right-[12%] top-12 h-[42%] border border-sky-200/25 bg-[#082f49] shadow-[inset_0_0_18px_rgba(14,165,233,.22)]" />
        <span className="absolute left-[20%] right-[18%] top-[58%] h-1 rotate-[-8deg] bg-amber-300/60" />
        <DeskFurniture />
      </>
    );
  if (type === "workboard" || type === "blueprint" || type === "health")
    return (
      <>
        <span className="absolute left-[13%] right-[13%] top-12 h-[38%] border border-sky-200/25 bg-[#0c2847] shadow-[inset_0_0_14px_rgba(56,189,248,.18)]" />
        <span className="absolute left-[18%] top-[55px] h-1.5 w-[20%] bg-sky-300/50" />
        <span className="absolute left-[43%] top-[55px] h-1.5 w-[14%] bg-emerald-300/50" />
        <span className="absolute right-[18%] top-[55px] h-1.5 w-[18%] bg-rose-300/50" />
        <DeskFurniture />
      </>
    );
  if (type === "build" || type === "research")
    return (
      <>
        <span className="absolute bottom-4 left-[9%] right-[9%] h-8 border border-slate-300/20 bg-slate-800/90" />
        <span className="absolute bottom-12 left-[18%] h-7 w-12 border border-cyan-200/20 bg-slate-950" />
        <span className="absolute bottom-12 right-[18%] h-7 w-12 border border-cyan-200/20 bg-slate-950" />
        <span className="absolute bottom-4 left-1/2 h-12 w-px bg-slate-400/40" />
      </>
    );
  if (type === "finance" || type === "communications")
    return (
      <>
        <span className="absolute left-[18%] right-[18%] top-12 h-8 border border-teal-200/20 bg-[#092f36]" />
        <span className="absolute left-[25%] top-[67px] h-3 w-1.5 bg-teal-300/50" />
        <span className="absolute left-[34%] top-[61px] h-5 w-1.5 bg-teal-300/60" />
        <span className="absolute left-[43%] top-[56px] h-10 w-1.5 bg-teal-300/75" />
        <DeskFurniture />
      </>
    );
  return <DeskFurniture />;
}

function Room({ room }: { room: OfficeMapRoom }) {
  const Icon = room.icon;
  return (
    <Link
      to={room.route}
      aria-label={`${room.label} — ${room.purpose}`}
      className={`group relative isolate overflow-visible border-[3px] bg-[#0b1423] shadow-lg transition duration-300 hover:z-30 hover:scale-[1.09] hover:bg-[#101e32] hover:shadow-2xl focus-visible:z-30 focus-visible:scale-[1.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${toneClasses[room.tone]} ${room.placement}`}
    >
      <div className="absolute inset-[3px] overflow-hidden bg-[linear-gradient(155deg,rgba(51,65,85,.58),rgba(2,6,23,.92)_70%)]">
        <div className="absolute inset-x-0 top-0 h-8 border-b border-white/10 bg-slate-950/45" />
        <RoomFurnishings type={room.furnishing} />
        <span
          className="absolute bottom-2 right-2 h-8 w-3 rounded-t-full bg-emerald-900/80"
          aria-hidden="true"
        />
      </div>
      <div className="relative flex h-full flex-col p-2.5">
        <div className="flex items-start gap-2">
          <span className="rounded-md border border-current bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-black text-white">
            {room.number}
          </span>
          <h2 className="min-w-0 text-[12px] font-extrabold leading-tight text-white sm:text-[13px]">
            {room.label}
          </h2>
          <span className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 bg-slate-950/80 text-white">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
        <div className="mt-auto translate-y-1 rounded-sm border border-white/10 bg-black/85 px-2 py-1.5 opacity-0 shadow-xl transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <p className="text-[10px] leading-tight text-slate-100">{room.purpose}</p>
          <p className="mt-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white">
            Open room →
          </p>
        </div>
        {room.route === "/approvals" && <ApprovalIndicator />}
      </div>
      <span
        className="absolute -bottom-[3px] left-1/2 z-20 h-3 w-9 -translate-x-1/2 border-x-[3px] border-t-[3px] border-amber-100/70 bg-[#263244]"
        aria-hidden="true"
      />
    </Link>
  );
}

function Hallway({ row, label }: { row: string; label: string }) {
  return (
    <div
      className={`relative col-span-12 ${row} flex items-center justify-center overflow-hidden border-y border-amber-100/20 bg-[repeating-linear-gradient(90deg,#2b3748_0,#2b3748_46px,#334155_47px,#334155_48px)] shadow-[inset_0_8px_14px_rgba(0,0,0,.2),inset_0_-8px_14px_rgba(0,0,0,.2)]`}
    >
      <span className="rounded-full border border-amber-100/15 bg-slate-950/65 px-4 py-1 text-[9px] font-black uppercase tracking-[0.28em] text-amber-100/60">
        {label}
      </span>
    </div>
  );
}

function BrainHub() {
  return (
    <Link
      to="/brain"
      aria-label="Open CanX Brain"
      className="group relative col-span-2 col-start-5 row-start-3 z-10 overflow-visible border-[3px] border-cyan-300 bg-[radial-gradient(circle_at_50%_58%,#155e75,#07111f_70%)] shadow-[0_0_34px_rgba(34,211,238,.32)] transition duration-300 hover:z-30 hover:scale-110 hover:shadow-[0_0_52px_rgba(34,211,238,.58)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <div className="absolute inset-3 rounded-[50%] border border-cyan-200/30 bg-cyan-400/5" />
      <div className="relative flex h-full flex-col items-center justify-center text-center text-white">
        <Brain className="h-8 w-8 text-cyan-200" />
        <strong className="mt-1 text-sm">CanX Brain</strong>
        <span className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-cyan-100/70">
          Integrated memory
        </span>
      </div>
      <span className="absolute -bottom-[3px] left-1/2 h-3 w-9 -translate-x-1/2 border-x-[3px] border-t-[3px] border-amber-100/70 bg-[#263244]" />
    </Link>
  );
}

export function Office3D() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#020611] px-2 py-3 text-white sm:px-4">
      <header className="mx-auto mb-3 flex max-w-[1600px] items-center justify-between gap-3 rounded-lg border border-slate-700 bg-[#0a101c] px-4 py-2.5 shadow-lg">
        <div>
          <div className="flex items-center gap-3">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-400">
              CanX Office
            </p>
            <span className="rounded-full border border-amber-300/35 bg-amber-950/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-200">
              Private owner review
            </span>
          </div>
          <h1 className="mt-0.5 text-xl font-black sm:text-2xl">19-room cutaway office</h1>
        </div>
        <p className="hidden max-w-md text-right text-xs text-slate-300 md:block">
          Every room is furnished and visible. Point to inspect it; click to walk in.
        </p>
      </header>

      <div className="mx-auto max-w-[1600px] overflow-x-auto rounded-xl border border-slate-700 bg-[#050913] p-2 shadow-[0_20px_65px_rgba(0,0,0,.62)]">
        <div className="relative min-w-[1180px] overflow-visible border-[8px] border-slate-500/85 bg-[#263244] p-2 shadow-[inset_0_0_45px_rgba(0,0,0,.62)]">
          <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:22px_22px]" />
          <div className="relative grid grid-cols-12 grid-rows-[138px_28px_132px_28px_132px_28px_128px] gap-x-2">
            {rooms.map((room) => (
              <Room key={room.number} room={room} />
            ))}
            <BrainHub />
            <Hallway row="row-start-2" label="Knowledge corridor" />
            <Hallway row="row-start-4" label="Central corridor" />
            <Hallway row="row-start-6" label="Main corridor" />
          </div>

          <div className="relative mt-2 grid grid-cols-[1fr_auto] items-stretch gap-2">
            <Link
              to="/analytics"
              className="group flex min-h-[70px] items-center gap-4 border-[3px] border-orange-400 bg-[linear-gradient(100deg,#4a1d08,#7c2d12,#111827)] px-5 py-2 shadow-[0_0_24px_rgba(249,115,22,.18)] transition hover:-translate-y-1 hover:border-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-orange-300 bg-black/35 text-orange-200">
                <BarChart3 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-black text-white">Analytics Control Wall</h2>
                <p className="text-[10px] text-orange-100/85">
                  Revenue · expenses · progress · workload · growth · subscriptions · Safe Highways
                </p>
              </div>
              <span className="ml-auto text-[10px] font-black uppercase tracking-[0.16em] text-orange-200">
                Open wall →
              </span>
            </Link>
            <div className="flex min-w-44 flex-col items-center justify-center border-[3px] border-amber-100/50 bg-slate-800 px-5 text-center">
              <Building2 className="h-5 w-5 text-amber-100/80" />
              <span className="mt-1 text-[9px] font-black uppercase tracking-[0.25em] text-amber-100">
                Main entrance
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
