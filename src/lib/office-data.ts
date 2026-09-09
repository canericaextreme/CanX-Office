/**
 * CanX Office — Phase 1 sample data and navigation definitions.
 *
 * Everything here is labelled sample/demo data. No live accounts,
 * no real routing, no external side effects.
 */

import {
  Home,
  Building2,
  Brain,
  Lightbulb,
  FolderKanban,
  ShieldCheck,
  ClipboardList,
  Users,
  Wrench,
  Landmark,
  CreditCard,
  Mail,
  Scale,
  FileText,
  BookOpen,
  Plug,
  HeartPulse,
  CheckSquare,
  Map,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

export type RoomId =
  | "reception"
  | "owner-desk"
  | "brain"
  | "idea-garage"
  | "project-rooms"
  | "safe-highways"
  | "work-board"
  | "office-team"
  | "build-testing"
  | "finance"
  | "subscriptions"
  | "communications"
  | "legal"
  | "records"
  | "skills"
  | "systems"
  | "health"
  | "approvals"
  | "blueprint"
  | "future";

export interface RoomDef {
  id: RoomId;
  label: string;
  shortLabel: string;
  route: string;
  icon: LucideIcon;
  purpose: string;
  area: "public" | "operations" | "support" | "system" | "expansion";
  position: { x: number; y: number; z: number };
  color: string;
}

export const ROOMS: RoomDef[] = [
  {
    id: "reception",
    label: "Reception / Office Manager",
    shortLabel: "Reception",
    route: "/",
    icon: Building2,
    purpose: "Single point of instruction — type a request, see status, next step.",
    area: "public",
    position: { x: 0, y: 0, z: 0 },
    color: "#ef4444",
  },
  {
    id: "owner-desk",
    label: "Owner's Desk",
    shortLabel: "Owner's Desk",
    route: "/owner-desk",
    icon: Home,
    purpose: "John's daily overview — decisions, red stops, priorities, cost guardrail.",
    area: "operations",
    position: { x: -3, y: 0, z: -2 },
    color: "#f97316",
  },
  {
    id: "brain",
    label: "Goal & Analytics / CanX Brain",
    shortLabel: "CanX Brain",
    route: "/brain",
    icon: Brain,
    purpose: "Interactive brain map of projects, workers, skills, and connections.",
    area: "operations",
    position: { x: 3, y: 0, z: -2 },
    color: "#a855f7",
  },
  {
    id: "idea-garage",
    label: "Idea Garage / Income & Decision Room",
    shortLabel: "Idea Garage",
    route: "/idea-garage",
    icon: Lightbulb,
    purpose: "Bike rack for raw ideas, bulletin board for contenders, decision table.",
    area: "operations",
    position: { x: -2, y: 0, z: -4 },
    color: "#eab308",
  },
  {
    id: "project-rooms",
    label: "Project Rooms",
    shortLabel: "Projects",
    route: "/projects",
    icon: FolderKanban,
    purpose: "Separate workstreams with goals, tasks, files, decisions, cost, history.",
    area: "operations",
    position: { x: 2, y: 0, z: -4 },
    color: "#3b82f6",
  },
  {
    id: "safe-highways",
    label: "Safe Highways Room",
    shortLabel: "Safe Highways",
    route: "/safe-highways",
    icon: ShieldCheck,
    purpose: "Programme oversight — public app, foreman, operations, routing evidence.",
    area: "operations",
    position: { x: 0, y: 0, z: -6 },
    color: "#22c55e",
  },
  {
    id: "work-board",
    label: "Work Board",
    shortLabel: "Work Board",
    route: "/work-board",
    icon: ClipboardList,
    purpose: "Canonical queue — tasks, dependencies, blockers, priorities, evidence.",
    area: "operations",
    position: { x: -4, y: 0, z: 1 },
    color: "#06b6d4",
  },
  {
    id: "office-team",
    label: "Office Team",
    shortLabel: "Team",
    route: "/office-team",
    icon: Users,
    purpose: "Role cards, capabilities, permissions, current job, last result, reviewer.",
    area: "operations",
    position: { x: 4, y: 0, z: 1 },
    color: "#ec4899",
  },
  {
    id: "build-testing",
    label: "Build & Testing",
    shortLabel: "Build",
    route: "/build-testing",
    icon: Wrench,
    purpose: "Controlled development — briefs, review findings, tests, release gates.",
    area: "support",
    position: { x: -5, y: 0, z: -2 },
    color: "#6366f1",
  },
  {
    id: "finance",
    label: "Finance Office",
    shortLabel: "Finance",
    route: "/finance",
    icon: Landmark,
    purpose: "Income, expenses, receipts, reconciliation, allocations, tax prep.",
    area: "support",
    position: { x: 5, y: 0, z: -2 },
    color: "#10b981",
  },
  {
    id: "subscriptions",
    label: "Subscription Watch",
    shortLabel: "Subscriptions",
    route: "/subscriptions",
    icon: CreditCard,
    purpose: "Recurring subscriptions, variable API use, hosting, renewals, alternatives.",
    area: "support",
    position: { x: -5, y: 0, z: -5 },
    color: "#14b8a6",
  },
  {
    id: "communications",
    label: "Communications",
    shortLabel: "Communications",
    route: "/communications",
    icon: Mail,
    purpose: "Drafts and delivery oversight — mailboxes, recipient checks, evidence.",
    area: "support",
    position: { x: 5, y: 0, z: -5 },
    color: "#f59e0b",
  },
  {
    id: "legal",
    label: "Legal & Compliance",
    shortLabel: "Legal",
    route: "/legal",
    icon: Scale,
    purpose: "Obligations and risks — issue register, agreements, IP/control records.",
    area: "support",
    position: { x: -3, y: 0, z: -7 },
    color: "#8b5cf6",
  },
  {
    id: "records",
    label: "Records & Rules",
    shortLabel: "Records",
    route: "/records",
    icon: FileText,
    purpose: "Canonical knowledge — versioned files, decisions, sources, search, exports.",
    area: "support",
    position: { x: 3, y: 0, z: -7 },
    color: "#64748b",
  },
  {
    id: "skills",
    label: "Skills / SOP Library",
    shortLabel: "Skills",
    route: "/skills",
    icon: BookOpen,
    purpose: "Approved procedures, versions, permissions, tests, review dates.",
    area: "support",
    position: { x: -6, y: 0, z: 3 },
    color: "#84cc16",
  },
  {
    id: "systems",
    label: "Systems & Connections",
    shortLabel: "Systems",
    route: "/systems",
    icon: Plug,
    purpose: "Account and integration control — connection states, ownership, health.",
    area: "system",
    position: { x: 6, y: 0, z: 3 },
    color: "#d946ef",
  },
  {
    id: "health",
    label: "Office Health / Backup & Recovery",
    shortLabel: "Health",
    route: "/health",
    icon: HeartPulse,
    purpose: "Reliability — incidents, stale feeds, failed jobs, backups, restore evidence.",
    area: "system",
    position: { x: -6, y: 0, z: 6 },
    color: "#f43f5e",
  },
  {
    id: "approvals",
    label: "Approvals",
    shortLabel: "Approvals",
    route: "/approvals",
    icon: CheckSquare,
    purpose: "One decision inbox — exact action, reasons, alternatives, cost, risk.",
    area: "system",
    position: { x: 6, y: 0, z: 6 },
    color: "#fb7185",
  },
  {
    id: "blueprint",
    label: "Office Blueprint",
    shortLabel: "Blueprint",
    route: "/blueprint",
    icon: Map,
    purpose: "Current specification, phase progress, room map, dependency records.",
    area: "system",
    position: { x: 0, y: 0, z: 4 },
    color: "#38bdf8",
  },
  {
    id: "future",
    label: "Future Department",
    shortLabel: "Future",
    route: "/future",
    icon: HelpCircle,
    purpose: "Reserved expansion — empty, labelled placeholder; no pretend staff or spend.",
    area: "expansion",
    position: { x: 0, y: 0, z: 8 },
    color: "#52525b",
  },
];

export const roomById = (id: RoomId): RoomDef => ROOMS.find((r) => r.id === id) ?? ROOMS[0]!;
export const roomByRoute = (route: string): RoomDef =>
  ROOMS.find((r) => r.route === route) ?? ROOMS[0]!;

export type StatusTone = "green" | "blue" | "yellow" | "red" | "grey";

export interface StatusItem {
  id: string;
  tone: StatusTone;
  title: string;
  scope?: string;
  evidence?: string;
  time?: string;
  question?: string;
  reason?: string;
  cause?: string;
  effect?: string;
  action?: string;
}

export const STATUS_HELP = {
  green: "Verified or healthy within a stated scope",
  blue: "Work is actively moving",
  yellow: "Review, information, permission, or decision needed",
  red: "Stop, failure, or urgent action",
  grey: "Planned, disconnected, stale/unknown, or not checked",
};

export const STATUS_COLORS: Record<StatusTone, string> = {
  green: "#22c55e",
  blue: "#3b82f6",
  yellow: "#eab308",
  red: "#ef4444",
  grey: "#71717a",
};

export interface WorkItem {
  id: string;
  title: string;
  status: StatusTone;
  project: string;
  blocker?: string;
  evidence?: string;
}

export interface WorkerCard {
  id: string;
  role: string;
  provider: string;
  currentJob: string;
  lastResult: string;
  reviewer: string;
}

export interface ProjectCard {
  id: string;
  name: string;
  status: StatusTone;
  healthText: string;
  tasksOpen: number;
  tasksDone: number;
}

export interface ApprovalCard {
  id: string;
  action: string;
  cost: string;
  risk: string;
  status: StatusTone;
  requestedAt: string;
}

export const SAMPLE_WORK_ITEMS: WorkItem[] = [
  {
    id: "w1",
    title: "Review Safe Highways routing evidence",
    status: "blue",
    project: "Safe Highways",
    evidence: "Sample routing log inspected",
  },
  {
    id: "w2",
    title: "Draft income goal baseline",
    status: "yellow",
    project: "CanX Office",
    blocker: "Needs John's definition of income",
  },
  {
    id: "w3",
    title: "Confirm backend provider unknowns",
    status: "yellow",
    project: "CanX Office",
    blocker: "MFA, backup, and restore details needed",
  },
  {
    id: "w4",
    title: "Build Phase 1 office shell",
    status: "blue",
    project: "CanX Office",
    evidence: "20 destinations planned",
  },
];

export const SAMPLE_WORKERS: WorkerCard[] = [
  {
    id: "x1",
    role: "Office Manager",
    provider: "ChatGPT (planned)",
    currentJob: "Routing incoming requests",
    lastResult: "Sample plan drafted",
    reviewer: "Claude (pending)",
  },
  {
    id: "x2",
    role: "Quality & Security",
    provider: "Claude (planned)",
    currentJob: "Reviewing Phase 1 safeguards",
    lastResult: "Checklist prepared",
    reviewer: "Manual review fallback",
  },
  {
    id: "x3",
    role: "Finance & Records",
    provider: "TBD",
    currentJob: "Subscription cost rollup",
    lastResult: "Unknown until accounts connected",
    reviewer: "None",
  },
];

export const SAMPLE_PROJECTS: ProjectCard[] = [
  {
    id: "p1",
    name: "Safe Highways Alberta",
    status: "green",
    healthText: "Read-only view; no live connection",
    tasksOpen: 2,
    tasksDone: 5,
  },
  {
    id: "p2",
    name: "Trail Tales",
    status: "grey",
    healthText: "Phase 1 placeholder; no live app link",
    tasksOpen: 1,
    tasksDone: 0,
  },
  {
    id: "p3",
    name: "CanX Office",
    status: "blue",
    healthText: "Phase 1 build in progress",
    tasksOpen: 4,
    tasksDone: 2,
  },
];

export const SAMPLE_APPROVALS: ApprovalCard[] = [
  {
    id: "a1",
    action: "Connect read-only Safe Highways inventory",
    cost: "Unknown until provider chosen",
    risk: "Low; read-only, no mutation",
    status: "yellow",
    requestedAt: "Phase 3 (not yet active)",
  },
  {
    id: "a2",
    action: "Enable receipt mailbox scan",
    cost: "Unknown",
    risk: "Medium; mailbox scope and identity must be confirmed",
    status: "grey",
    requestedAt: "Phase 3+ (not yet active)",
  },
];

export const SAMPLE_STATUS: StatusItem[] = [
  {
    id: "s1",
    tone: "green",
    title: "Phase 0 blueprint approved",
    scope: "Planning scope only",
    evidence: "Approved plan document",
    time: "9 Sep 2026",
  },
  {
    id: "s2",
    tone: "blue",
    title: "Phase 1 office shell build",
    scope: "Visual office + simple screens",
    evidence: "20 destinations defined",
    time: "In progress",
  },
  {
    id: "s3",
    tone: "yellow",
    title: "Backend provider decision",
    question: "Approve Lovable Cloud or CanX-controlled Supabase?",
  },
  {
    id: "s4",
    tone: "red",
    title: "No live connections yet",
    cause: "Phase 1 is demonstration-only",
    effect: "External actions are disabled",
    action: "Wait for Phase 3 authorization",
  },
  {
    id: "s5",
    tone: "grey",
    title: "Verified subscription costs",
    reason: "Not connected; no current data",
  },
];

export interface BrainNode {
  id: string;
  label: string;
  category: "room" | "worker" | "project" | "skill" | "connection";
  status: StatusTone;
  x: number;
  y: number;
}

export interface BrainLink {
  source: string;
  target: string;
  label: string;
}

export const BRAIN_NODES: BrainNode[] = [
  { id: "reception", label: "Reception", category: "room", status: "blue", x: 0, y: 0 },
  { id: "owner-desk", label: "Owner's Desk", category: "room", status: "blue", x: -60, y: -30 },
  { id: "brain", label: "CanX Brain", category: "room", status: "blue", x: 60, y: -30 },
  { id: "idea-garage", label: "Idea Garage", category: "room", status: "yellow", x: -40, y: 40 },
  { id: "project-rooms", label: "Projects", category: "room", status: "blue", x: 40, y: 40 },
  { id: "safe-highways", label: "Safe Highways", category: "project", status: "green", x: 0, y: -80 },
  { id: "trail-tales", label: "Trail Tales", category: "project", status: "grey", x: 80, y: 0 },
  { id: "manager", label: "Office Manager", category: "worker", status: "blue", x: -80, y: 60 },
  { id: "reviewer", label: "Quality & Security", category: "worker", status: "yellow", x: 80, y: 60 },
  { id: "finance", label: "Finance", category: "room", status: "grey", x: -80, y: -60 },
  { id: "subscriptions", label: "Subscriptions", category: "room", status: "grey", x: -100, y: -80 },
  { id: "systems", label: "Systems", category: "connection", status: "grey", x: 80, y: -60 },
  { id: "approvals", label: "Approvals", category: "room", status: "yellow", x: -40, y: -80 },
];

export const BRAIN_LINKS: BrainLink[] = [
  { source: "reception", target: "owner-desk", label: "escalates decisions" },
  { source: "reception", target: "brain", label: "routes analytics" },
  { source: "owner-desk", target: "approvals", label: "approves actions" },
  { source: "brain", target: "project-rooms", label: "tracks projects" },
  { source: "brain", target: "safe-highways", label: "oversees programme" },
  { source: "project-rooms", target: "safe-highways", label: "contains" },
  { source: "project-rooms", target: "trail-tales", label: "contains" },
  { source: "manager", target: "reception", label: "handles requests" },
  { source: "reviewer", target: "manager", label: "independent review" },
  { source: "finance", target: "subscriptions", label: "tracks spend" },
  { source: "systems", target: "safe-highways", label: "read-only link (planned)" },
];

export const CATEGORY_COLORS: Record<BrainNode["category"], string> = {
  room: "#3b82f6",
  worker: "#ec4899",
  project: "#22c55e",
  skill: "#84cc16",
  connection: "#f59e0b",
};

export const CATEGORY_LABELS: Record<BrainNode["category"], string> = {
  room: "Office room",
  worker: "Worker role",
  project: "Project",
  skill: "Skill / SOP",
  connection: "Connection",
};
