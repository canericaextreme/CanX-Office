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

type RoomTone = "red" | "blue" | "purple" | "teal" | "cyan" | "lime";
type RoomShape = "round" | "oval" | "wedge" | "wide" | "soft";

type OfficeRoom = {
  number: string;
  label: string;
  purpose: string;
  route: string;
  icon: LucideIcon;
  tone: RoomTone;
  shape: RoomShape;
  x: number;
  y: number;
};

const rooms: OfficeRoom[] = [
  {
    number: "04",
    label: "Idea Garage",
    purpose: "Ideas, workshop and bike rack",
    route: "/idea-garage",
    icon: Bike,
    tone: "red",
    shape: "wide",
    x: 30,
    y: 13,
  },
  {
    number: "08",
    label: "Systems",
    purpose: "Connections, backup and recovery",
    route: "/systems",
    icon: Database,
    tone: "cyan",
    shape: "soft",
    x: 41,
    y: 6,
  },
  {
    number: "19",
    label: "Family Continuity & Training",
    purpose: "Family knowledge and approved working procedures",
    route: "/family-continuity",
    icon: Users,
    tone: "lime",
    shape: "wide",
    x: 24,
    y: 61,
  },
  {
    number: "17",
    label: "Research",
    purpose: "Evidence, options and advice",
    route: "/research",
    icon: Microscope,
    tone: "purple",
    shape: "wide",
    x: 60,
    y: 7,
  },
  {
    number: "11",
    label: "Legal",
    purpose: "Risk, agreements and compliance",
    route: "/legal",
    icon: Scale,
    tone: "teal",
    shape: "oval",
    x: 70,
    y: 16,
  },
  {
    number: "16",
    label: "Safe Highways",
    purpose: "Programme and routing oversight",
    route: "/safe-highways",
    icon: ShieldCheck,
    tone: "blue",
    shape: "wedge",
    x: 88,
    y: 35,
  },

  {
    number: "03",
    label: "Approvals",
    purpose: "Actions, risk and alternatives",
    route: "/approvals",
    icon: CheckCircle2,
    tone: "red",
    shape: "oval",
    x: 13,
    y: 36,
  },
  {
    number: "05",
    label: "Office Team",
    purpose: "Roles and capabilities",
    route: "/office-team",
    icon: Users,
    tone: "blue",
    shape: "soft",
    x: 16,
    y: 21,
  },
  {
    number: "09",
    label: "Office Health",
    purpose: "Uptime and performance",
    route: "/health",
    icon: HeartPulse,
    tone: "cyan",
    shape: "wide",
    x: 18,
    y: 47,
  },
  {
    number: "14",
    label: "Work Board",
    purpose: "Tasks, blockers and priorities",
    route: "/work-board",
    icon: ClipboardList,
    tone: "blue",
    shape: "wide",
    x: 85,
    y: 23,
  },
  {
    number: "10",
    label: "Communications",
    purpose: "Drafts and delivery",
    route: "/communications",
    icon: Mail,
    tone: "teal",
    shape: "oval",
    x: 10,
    y: 58,
  },

  {
    number: "02",
    label: "Owner's Desk",
    purpose: "Decisions, priorities and cost",
    route: "/owner-desk",
    icon: Landmark,
    tone: "red",
    shape: "round",
    x: 50,
    y: 14,
  },
  {
    number: "07",
    label: "Blueprint",
    purpose: "Plans, rooms and dependencies",
    route: "/blueprint",
    icon: Network,
    tone: "purple",
    shape: "round",
    x: 39,
    y: 70,
  },
  {
    number: "01",
    label: "Reception",
    purpose: "Instructions and next steps",
    route: "/",
    icon: Building2,
    tone: "red",
    shape: "wedge",
    x: 50,
    y: 78,
  },
  {
    number: "06",
    label: "Records",
    purpose: "Files, decisions and sources",
    route: "/records",
    icon: FileText,
    tone: "purple",
    shape: "soft",
    x: 78,
    y: 50,
  },
  {
    number: "13",
    label: "Finance",
    purpose: "Income, expenses and receipts",
    route: "/finance",
    icon: BarChart3,
    tone: "teal",
    shape: "oval",
    x: 91,
    y: 59,
  },
  {
    number: "12",
    label: "Subscriptions",
    purpose: "Renewals, use and alternatives",
    route: "/subscriptions",
    icon: CreditCard,
    tone: "teal",
    shape: "soft",
    x: 83,
    y: 69,
  },
  {
    number: "15",
    label: "Build & Testing",
    purpose: "Briefs, checks and releases",
    route: "/build-testing",
    icon: Wrench,
    tone: "blue",
    shape: "round",
    x: 66,
    y: 66,
  },
];

const toneClasses: Record<RoomTone, string> = {
  red: "border-rose-300/80 bg-rose-950/85 shadow-rose-500/30 group-hover:bg-rose-600",
  blue: "border-sky-300/80 bg-sky-950/85 shadow-sky-500/30 group-hover:bg-sky-600",
  purple: "border-violet-300/80 bg-violet-950/85 shadow-violet-500/30 group-hover:bg-violet-600",
  teal: "border-teal-200/80 bg-teal-950/85 shadow-teal-400/30 group-hover:bg-teal-600",
  cyan: "border-cyan-200/80 bg-cyan-950/85 shadow-cyan-400/30 group-hover:bg-cyan-600",
  lime: "border-lime-100 bg-lime-500 !text-slate-950 shadow-[0_0_22px_rgba(163,230,53,.72)] group-hover:bg-lime-300 group-hover:shadow-[0_0_34px_rgba(190,242,100,.95)]",
};

const haloClasses: Record<RoomShape, string> = {
  round: "h-28 w-28 rounded-full",
  oval: "h-24 w-40 rounded-[50%]",
  wedge: "h-28 w-40 [clip-path:polygon(14%_0,100%_8%,88%_100%,0_84%)]",
  wide: "h-24 w-48 rounded-[36%_48%_30%_44%]",
  soft: "h-28 w-40 rounded-[2.5rem_4rem_2rem_3.5rem]",
};

function RoomHotspot({ room }: { room: OfficeRoom }) {
  const Icon = room.icon;
  return (
    <Link
      to={room.route}
      aria-label={`${room.label} — ${room.purpose}`}
      className="group absolute z-10 -translate-x-1/2 -translate-y-1/2 focus-visible:z-40 focus-visible:outline-none"
      style={{ left: `${room.x}%`, top: `${room.y}%` }}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 border-2 border-white/0 bg-black/0 opacity-0 shadow-2xl backdrop-brightness-110 transition duration-300 group-hover:scale-110 group-hover:border-white/75 group-hover:bg-white/10 group-hover:opacity-100 group-focus-visible:scale-110 group-focus-visible:border-white/75 group-focus-visible:bg-white/10 group-focus-visible:opacity-100 ${haloClasses[room.shape]}`}
      />
      <span
        className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-black text-white shadow-lg backdrop-blur-md transition duration-300 group-hover:scale-110 group-hover:shadow-xl group-focus-visible:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-white ${toneClasses[room.tone]}`}
      >
        <span className="rounded-full bg-black/45 px-1.5 py-0.5">{room.number}</span>
        <span className="whitespace-nowrap">{room.label}</span>
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full mt-1 hidden w-44 -translate-x-1/2 rounded-lg border border-white/20 bg-slate-950/95 px-3 py-2 text-center text-[10px] leading-snug text-white shadow-2xl group-hover:block group-focus-visible:block">
        {room.purpose}
        <strong className="mt-1 block uppercase tracking-[0.12em]">Open room →</strong>
      </span>
    </Link>
  );
}

export function Office3D() {
  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#020611] px-2 py-3 text-white sm:px-4">
      <header className="mx-auto mb-3 flex max-w-[1700px] items-center justify-between gap-3 rounded-lg border border-slate-700 bg-[#0a101c] px-4 py-2.5 shadow-lg">
        <div>
          <div className="flex items-center gap-3">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-400">
              CanX Office
            </p>
            <span className="rounded-full border border-amber-300/35 bg-amber-950/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-200">
              Private owner review
            </span>
          </div>
          <h1 className="mt-0.5 text-xl font-black sm:text-2xl">18-room circular office</h1>
        </div>
        <p className="hidden max-w-lg text-right text-xs text-slate-300 md:block">
          Point to a furnished office to bring it forward. Click its name to walk in.
        </p>
      </header>

      <section
        aria-label="Interactive circular CanX Office"
        className="mx-auto w-full max-w-[1700px] overflow-hidden rounded-2xl border border-slate-600 bg-[#050913] p-2 shadow-[0_22px_70px_rgba(0,0,0,.68)]"
      >
        <div className="relative mx-auto aspect-[1672/941] w-full overflow-hidden rounded-xl bg-slate-950">
          <img
            src="/canx-office-circular-cutaway-v2.jpg"
            alt="A realistic circular office complex with furnished rooms arranged around a central atrium"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_48%,rgba(2,6,23,.08)_72%,rgba(2,6,23,.45)_100%)]" />

          <Link
            to="/brain"
            aria-label="Open CanX Brain"
            className="group absolute left-[52%] top-[40%] z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-200/75 bg-cyan-950/75 px-4 py-2 text-center text-white shadow-[0_0_30px_rgba(34,211,238,.38)] backdrop-blur-md transition duration-300 hover:scale-110 hover:bg-cyan-700/90 hover:shadow-[0_0_48px_rgba(34,211,238,.62)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-cyan-100" />
              <strong className="text-xs">CanX Brain</strong>
            </span>
            <span className="mt-0.5 block text-[8px] uppercase tracking-[0.15em] text-cyan-100/80">
              Central knowledge atrium
            </span>
          </Link>

          {rooms.map((room) => (
            <RoomHotspot key={room.number} room={room} />
          ))}
        </div>

        <Link
          to="/analytics"
          className="group mt-2 flex min-h-[66px] w-full items-center gap-4 rounded-lg border-2 border-orange-400 bg-[linear-gradient(100deg,#4a1d08,#7c2d12,#111827)] px-5 py-2 shadow-[0_0_24px_rgba(249,115,22,.18)] transition hover:-translate-y-0.5 hover:border-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200"
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
      </section>
    </main>
  );
}
