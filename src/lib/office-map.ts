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

export type RoomTone = "red" | "blue" | "purple" | "teal" | "cyan" | "lime";
export type RoomShape = "round" | "oval" | "wedge" | "wide" | "soft";

export type OfficeRoom = {
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

export const OFFICE_MAP_ROOMS: OfficeRoom[] = [
  { number: "20", label: "Future", purpose: "Longer plans for CanX, retirement and family", route: "/future", icon: Network, tone: "purple", shape: "soft", x: 72, y: 79 },
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
    label: "Family Continuity, Skills & Training",
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
    label: "Communications & Marketing",
    purpose: "Correspondence, launch plans, campaigns and results",
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
    route: "/reception",
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

export const OFFICE_LABEL_POSITIONS_KEY = 'canx-office-label-positions-v1';
export type LabelPositions = Record<string, { x: number; y: number }>;

export function clockwiseOfficeRooms(positions: LabelPositions = {}): OfficeRoom[] {
  const centre = { x: 52, y: 40 };
  const point = (room: OfficeRoom) => {
    const saved = positions[room.number];
    return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) ? saved : room;
  };
  const angle = (room: OfficeRoom) => {
    const p = point(room);
    return Math.atan2(p.y - centre.y, p.x - centre.x);
  };
  const reception = OFFICE_MAP_ROOMS.find(room => room.route === '/reception')!;
  const start = angle(reception);
  const turn = (room: OfficeRoom) => (angle(room) - start + Math.PI * 2) % (Math.PI * 2);
  return [...OFFICE_MAP_ROOMS].sort((a, b) => {
    if (a === reception) return -1;
    if (b === reception) return 1;
    return turn(a) - turn(b);
  });
}

export function readOfficeLabelPositions(): LabelPositions {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(OFFICE_LABEL_POSITIONS_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) =>
      value && typeof value === 'object' && Number.isFinite(value.x) && Number.isFinite(value.y)));
  } catch { return {}; }
}
