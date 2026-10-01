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
  Globe2,
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
    x: 39,
    y: 8,
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
    x: 62,
    y: 9,
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
    y: 14,
  },
  {
    number: "16",
    label: "Safe Highways",
    purpose: "Programme and routing oversight",
    route: "/safe-highways",
    icon: ShieldCheck,
    tone: "blue",
    shape: "wedge",
    x: 83,
    y: 69,
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
    x: 8,
    y: 54,
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
    x: 14,
    y: 20,
  },

  {
    number: "02",
    label: "Owner's Desk",
    purpose: "Decisions, priorities and cost",
    route: "/owner-desk",
    icon: Landmark,
    tone: "red",
    shape: "round",
    x: 33,
    y: 72,
  },
  {
    number: "07",
    label: "Blueprint",
    purpose: "Plans, rooms and dependencies",
    route: "/blueprint",
    icon: Network,
    tone: "purple",
    shape: "round",
    x: 50,
    y: 14,
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
    y: 55,
  },
  {
    number: "12",
    label: "Subscriptions",
    purpose: "Renewals, use and alternatives",
    route: "/subscriptions",
    icon: CreditCard,
    tone: "teal",
    shape: "soft",
    x: 89,
    y: 36,
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

const walkingPeople = [
  { route: "office-person--family", duration: "29s", delay: "-18s" },
  { route: "office-person--communications", duration: "37s", delay: "-7s" },
  { route: "office-person--systems", duration: "31s", delay: "-24s" },
  { route: "office-person--finance", duration: "41s", delay: "-14s" },
  { route: "office-person--owner", duration: "23s", delay: "-9s" },
  { route: "office-person--subscriptions", duration: "43s", delay: "-33s" },
  { route: "office-person--garage", duration: "47s", delay: "-29s" },
] as const;

function WalkingPeople() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[8] overflow-hidden">
      {walkingPeople.map((person, index) => (
        <span
          key={person.route}
          className={`office-person absolute ${person.route}`}
          style={{ animationDuration: person.duration, animationDelay: person.delay }}
        >
          <span
            className="office-person__sprite block"
            style={{ backgroundPosition: `${(index / 6) * 100}% center` }}
          />
          <span className="sr-only">Person {index + 1}</span>
        </span>
      ))}
    </div>
  );
}

function AmbientOfficeMotion() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[6] overflow-hidden">
      <div className="workboard-screen absolute left-[78.8%] top-[7.8%] h-[10.2%] w-[14.2%] overflow-hidden rounded-sm border border-cyan-200/20 bg-cyan-950/10 opacity-55 mix-blend-screen">
        <div className="workboard-grid absolute inset-0" />
        <div className="workboard-map absolute inset-y-[10%] left-[-35%] flex w-[135%] items-center justify-around text-cyan-200/55">
          <Globe2 className="h-[76%] w-auto" strokeWidth={1.1} />
          <Globe2 className="h-[76%] w-auto" strokeWidth={1.1} />
        </div>
        <span className="workboard-scan absolute inset-y-0 w-[18%] bg-gradient-to-r from-transparent via-cyan-200/35 to-transparent" />
      </div>
      <span className="office-lamp office-lamp--one absolute left-[68.2%] top-[49.7%] h-[5%] w-[3%] rounded-full" />
      <span className="office-lamp office-lamp--two absolute left-[92.2%] top-[48.3%] h-[5%] w-[3%] rounded-full" />
      <span className="office-lamp office-lamp--three absolute left-[56.5%] top-[54.2%] h-[4.5%] w-[2.8%] rounded-full" />
    </div>
  );
}

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
        className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-black text-white shadow-lg backdrop-blur-md transition duration-300 group-hover:scale-110 group-hover:shadow-xl group-focus-visible:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-white ${toneClasses[room.tone]}`}
      >
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
          </div>
        </div>
        <p className="hidden max-w-3xl whitespace-nowrap text-right text-4xl font-black italic tracking-wide sm:text-5xl text-rose-200 drop-shadow-[0_0_12px_rgba(251,113,133,.45)] md:block">
          If you can think it, we can do it.
        </p>
      </header>

      <section
        aria-label="Interactive circular CanX Office"
        className="mx-auto w-full max-w-[1700px] overflow-hidden rounded-2xl border border-slate-600 bg-[#050913] p-2 shadow-[0_22px_70px_rgba(0,0,0,.68)]"
      >
        <div className="relative mx-auto aspect-[1672/941] w-full overflow-hidden rounded-xl bg-slate-950">
          <img
            src="/canx-office-circular-cutaway-v4.jpg"
            alt="A realistic circular office complex with furnished rooms arranged around a central atrium"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_48%,rgba(2,6,23,.08)_72%,rgba(2,6,23,.45)_100%)]" />

          <WalkingPeople />
          <AmbientOfficeMotion />

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

          <style>{`
            .office-person {
              left: 50%;
              top: 80%;
              opacity: 0;
              transform: translate(-50%, -50%);
              animation-timing-function: linear;
              animation-iteration-count: infinite;
            }
            .office-person__sprite {
              width: 20px;
              height: 48px;
              background-image: url('/canx-office-people-v1.png');
              background-repeat: no-repeat;
              background-size: 700% 100%;
              filter: drop-shadow(0 2px 2px rgba(0, 0, 0, .72));
              transform-origin: 50% 100%;
              animation: office-walk-bob .54s ease-in-out infinite alternate;
            }
            .workboard-screen {
              transform: rotate(.8deg) skewY(-1deg);
              box-shadow: 0 0 10px rgba(34, 211, 238, .16);
            }
            .workboard-grid {
              background-image: linear-gradient(rgba(103,232,249,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,.1) 1px, transparent 1px);
              background-size: 12% 24%;
              animation: workboard-grid-drift 18s linear infinite;
            }
            .workboard-map { animation: workboard-map-drift 26s linear infinite; }
            .workboard-scan { animation: workboard-scan 9s ease-in-out infinite; }
            .office-lamp {
              background: radial-gradient(circle, rgba(255,244,190,.42) 0%, rgba(251,191,36,.2) 30%, transparent 70%);
              opacity: .15;
              filter: blur(2px);
              animation: office-lamp-glow 17s ease-in-out infinite;
            }
            .office-lamp--two { animation-delay: -6s; animation-duration: 23s; }
            .office-lamp--three { animation-delay: -13s; animation-duration: 29s; }
            }
            .office-person--family { animation-name: office-route-family; }
            .office-person--communications { animation-name: office-route-communications; }
            .office-person--systems { animation-name: office-route-systems; }
            .office-person--finance { animation-name: office-route-finance; }
            .office-person--owner { animation-name: office-route-owner; }
            .office-person--subscriptions { animation-name: office-route-subscriptions; }
            .office-person--garage { animation-name: office-route-garage; }

            @keyframes office-walk-bob {
              from { transform: translateY(-1px) rotate(-1deg); }
              to { transform: translateY(1px) rotate(1deg); }
            }
            @keyframes workboard-grid-drift {
              from { background-position: 0 0; }
              to { background-position: 24% 0; }
            }
            @keyframes workboard-map-drift {
              from { transform: translateX(0); }
              to { transform: translateX(50%); }
            }
            @keyframes workboard-scan {
              0%, 18% { left: -24%; opacity: 0; }
              28% { opacity: .7; }
              72% { opacity: .7; }
              82%, 100% { left: 110%; opacity: 0; }
            }
            @keyframes office-lamp-glow {
              0%, 52%, 100% { opacity: .12; transform: scale(.9); }
              60%, 82% { opacity: .8; transform: scale(1.18); }
            }
            @keyframes office-route-family {
              0%, 8% { left: 50%; top: 82%; opacity: 0; }
              12% { opacity: .95; }
              34% { left: 50%; top: 65%; }
              60% { left: 39%; top: 55%; }
              84% { left: 27%; top: 60%; opacity: .95; }
              92%, 100% { left: 24%; top: 61%; opacity: 0; }
            }
            @keyframes office-route-communications {
              0%, 5% { left: 48%; top: 80%; opacity: 0; }
              10% { opacity: .9; }
              32% { left: 45%; top: 58%; }
              58% { left: 31%; top: 42%; }
              84% { left: 18%; top: 23%; opacity: .9; }
              94%, 100% { left: 14%; top: 20%; opacity: 0; }
            }
            @keyframes office-route-systems {
              0%, 7% { left: 53%; top: 79%; opacity: 0; }
              11% { opacity: .92; }
              30% { left: 53%; top: 61%; }
              54% { left: 49%; top: 42%; }
              82% { left: 41%; top: 14%; opacity: .92; }
              92%, 100% { left: 39%; top: 8%; opacity: 0; }
            }
            @keyframes office-route-finance {
              0%, 9% { left: 51%; top: 82%; opacity: 0; }
              13% { opacity: .9; }
              34% { left: 56%; top: 64%; }
              58% { left: 70%; top: 55%; }
              84% { left: 87%; top: 55%; opacity: .9; }
              94%, 100% { left: 91%; top: 55%; opacity: 0; }
            }
            @keyframes office-route-owner {
              0%, 6% { left: 50%; top: 82%; opacity: 0; }
              12% { opacity: .95; }
              38% { left: 46%; top: 69%; }
              72% { left: 37%; top: 68%; opacity: .95; }
              90%, 100% { left: 33%; top: 72%; opacity: 0; }
            }
            @keyframes office-route-subscriptions {
              0%, 8% { left: 52%; top: 81%; opacity: 0; }
              12% { opacity: .9; }
              33% { left: 58%; top: 61%; }
              58% { left: 73%; top: 47%; }
              84% { left: 85%; top: 38%; opacity: .9; }
              94%, 100% { left: 89%; top: 36%; opacity: 0; }
            }
            @keyframes office-route-garage {
              0%, 7% { left: 49%; top: 81%; opacity: 0; }
              11% { opacity: .9; }
              31% { left: 47%; top: 62%; }
              55% { left: 40%; top: 43%; }
              82% { left: 32%; top: 18%; opacity: .9; }
              93%, 100% { left: 30%; top: 13%; opacity: 0; }
            }
            @media (prefers-reduced-motion: reduce) {
              .office-person, .workboard-map, .workboard-scan, .workboard-grid, .office-lamp { animation: none; }
              .office-person { display: none; }
            }
            @media (min-width: 640px) {
              .office-person__sprite { width: 26px; height: 61px; }
            }
          `}</style>
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
