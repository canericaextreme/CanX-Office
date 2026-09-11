/**
 * CanX Office — team roster.
 *
 * Device-only storage, by John's decision (10 Sep 2026). These are real
 * office roles John can rename, not sample data and not demo records.
 * Nothing here is shared between devices and nothing is written to the
 * CanX-owned database until John asks for shared storage.
 */

import { ROOMS, type RoomId } from "@/lib/office-data";

export interface TeamMember {
  id: string;
  /** Display name used when assigning work, e.g. spoken "assign Finance Officer". */
  name: string;
  /** What this person is responsible for. */
  role: string;
  /** The office room this person works out of. */
  roomId: RoomId;
  /** One line about what they cover. */
  focus: string;
}

export const TEAM_STORAGE_KEY = "canx.office.team.v1";
export const MAX_TEAM_MEMBERS = 24;
const MAX_NAME = 60;
const MAX_ROLE = 80;
const MAX_FOCUS = 200;

const ROOM_IDS = new Set<string>(ROOMS.map((room) => room.id));

/** The departmental roles already planned for the office. John can rename any of them. */
export const DEFAULT_TEAM: TeamMember[] = [
  {
    id: "t-manager",
    name: "Office Manager",
    role: "Coordination and task follow-through",
    roomId: "reception",
    focus: "Takes instructions, records tasks, checks results, keeps the master list straight.",
  },
  {
    id: "t-finance",
    name: "Finance Officer",
    role: "Receipts, costs and budget watch",
    roomId: "finance",
    focus: "Receipt review, running costs, subscriptions and the monthly ceiling.",
  },
  {
    id: "t-operations",
    name: "Operations Lead",
    role: "Day-to-day work and scheduling",
    roomId: "work-board",
    focus: "Keeps work moving, chases overdue items, reports what needs attention.",
  },
  {
    id: "t-projects",
    name: "Projects Lead",
    role: "Project rooms and delivery",
    roomId: "project-rooms",
    focus: "Project progress, milestones and cross-project coordination.",
  },
  {
    id: "t-ideas",
    name: "Ideas & Research",
    role: "Idea Lab, Bike Rack and feasibility",
    roomId: "idea-garage",
    focus: "Scores ideas on evidence, prepares research packages for your decision.",
  },
  {
    id: "t-systems",
    name: "Systems & Security",
    role: "Connections, access and safety checks",
    roomId: "systems",
    focus: "Connection status, owner sign-in, second-eyes review before risky changes.",
  },
];

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function room(value: unknown): RoomId | null {
  return typeof value === "string" && ROOM_IDS.has(value) ? (value as RoomId) : null;
}

/** Untrusted stored JSON in, valid roster out. Bad rows are dropped, never guessed at. */
export function parseTeam(raw: unknown): TeamMember[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const members: TeamMember[] = [];
  for (const entry of raw) {
    const item = entry as Partial<TeamMember> | null;
    const name = text(item?.name, MAX_NAME);
    const roomId = room(item?.roomId);
    const id = text(item?.id, 40);
    if (!name || !roomId || !id || seen.has(id)) continue;
    seen.add(id);
    members.push({
      id,
      name,
      role: text(item?.role, MAX_ROLE),
      roomId,
      focus: text(item?.focus, MAX_FOCUS),
    });
    if (members.length >= MAX_TEAM_MEMBERS) break;
  }
  return members;
}

export function roomLabel(roomId: RoomId): string {
  return ROOMS.find((r) => r.id === roomId)?.label ?? "Unassigned room";
}

export function newMemberId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function loadTeam(): TeamMember[] {
  if (typeof window === "undefined") return DEFAULT_TEAM;
  try {
    const stored = window.localStorage.getItem(TEAM_STORAGE_KEY);
    if (!stored) return DEFAULT_TEAM;
    const parsed = parseTeam(JSON.parse(stored));
    return parsed.length ? parsed : DEFAULT_TEAM;
  } catch {
    return DEFAULT_TEAM;
  }
}

export function saveTeam(members: TeamMember[]): TeamMember[] {
  const clean = parseTeam(members);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      /* storage unavailable — the roster still works for this session */
    }
  }
  return clean;
}

export function clearTeam(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TEAM_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** The shape sent to the Manager: names, roles and rooms only. */
export interface TeamContextMember {
  name: string;
  role: string;
  room: string;
}

export function teamForManager(members: TeamMember[]): TeamContextMember[] {
  return parseTeam(members)
    .slice(0, MAX_TEAM_MEMBERS)
    .map((member) => ({ name: member.name, role: member.role, room: roomLabel(member.roomId) }));
}
