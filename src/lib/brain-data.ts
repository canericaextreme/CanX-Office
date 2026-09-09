/**
 * CanX Brain — regions and nodes.
 *
 * Every node is derived from a record that actually exists in this repository:
 * office rooms (with their real routes), sample worker roles, and sample
 * project cards. Nothing is invented, measured, or live.
 */

import {
  ROOMS,
  SAMPLE_PROJECTS,
  SAMPLE_WORKERS,
  type RoomId,
  type StatusTone,
} from "./office-data";

export type BrainKind = "room" | "worker" | "project";

export interface BrainRegion {
  id: string;
  name: string;
  blurb: string;
  color: string;
  cx: number;
  cy: number;
  radius: number;
  rooms: RoomId[];
  workerIds?: string[];
  projectIds?: string[];
}

export interface BrainCell {
  id: string;
  label: string;
  kind: BrainKind;
  status: StatusTone;
  regionId: string;
  route: string;
  detail: string;
  x: number;
  y: number;
}

export interface BrainEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export const BRAIN_VIEW = { width: 800, height: 600 };

export const BRAIN_REGIONS: BrainRegion[] = [
  {
    id: "leadership",
    name: "Leadership & decisions",
    blurb: "Where John sets direction and clears approvals.",
    color: "#f97316",
    cx: 250,
    cy: 175,
    radius: 84,
    rooms: ["owner-desk", "approvals", "blueprint"],
  },
  {
    id: "operations",
    name: "Operations",
    blurb: "The daily queue: requests in, work moving, projects tracked.",
    color: "#38bdf8",
    cx: 400,
    cy: 300,
    radius: 82,
    rooms: ["reception", "work-board", "project-rooms", "idea-garage"],
  },
  {
    id: "programmes",
    name: "Programmes",
    blurb: "Programme oversight records. Read-only; no live programme link.",
    color: "#22c55e",
    cx: 566,
    cy: 180,
    radius: 84,
    rooms: ["safe-highways"],
    projectIds: ["p1", "p2", "p3"],
  },
  {
    id: "money",
    name: "Money & records",
    blurb: "Cost guardrail, subscriptions, canonical records and obligations.",
    color: "#10b981",
    cx: 208,
    cy: 398,
    radius: 86,
    rooms: ["finance", "subscriptions", "records", "legal"],
  },
  {
    id: "team",
    name: "Team & skills",
    blurb: "Worker roles and the approved procedures they must follow.",
    color: "#ec4899",
    cx: 400,
    cy: 468,
    radius: 78,
    rooms: ["office-team", "skills"],
    workerIds: ["x1", "x2", "x3"],
  },
  {
    id: "systems",
    name: "Systems & assurance",
    blurb: "Connections, build and testing, health, analytics, expansion.",
    color: "#a855f7",
    cx: 594,
    cy: 402,
    radius: 88,
    rooms: ["systems", "build-testing", "health", "communications", "brain", "future"],
  },
];

export const REGION_BY_ID = new Map(BRAIN_REGIONS.map((r) => [r.id, r]));

function ring(cx: number, cy: number, radius: number, index: number, total: number) {
  if (total === 1) return { x: cx, y: cy };
  const start = -Math.PI / 2;
  const angle = start + (index / total) * Math.PI * 2;
  const r = total > 4 ? radius * 0.82 : radius * 0.66;
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r * 0.86 };
}

function buildCells(): BrainCell[] {
  const cells: BrainCell[] = [];
  for (const region of BRAIN_REGIONS) {
    const members: Omit<BrainCell, "x" | "y">[] = [];

    for (const roomId of region.rooms) {
      const room = ROOMS.find((r) => r.id === roomId);
      if (!room) continue;
      members.push({
        id: `room:${room.id}`,
        label: room.shortLabel,
        kind: "room",
        status: "blue",
        regionId: region.id,
        route: room.route,
        detail: room.purpose,
      });
    }

    for (const workerId of region.workerIds ?? []) {
      const worker = SAMPLE_WORKERS.find((w) => w.id === workerId);
      if (!worker) continue;
      members.push({
        id: `worker:${worker.id}`,
        label: worker.role,
        kind: "worker",
        status: worker.provider === "TBD" ? "grey" : "yellow",
        regionId: region.id,
        route: "/office-team",
        detail: `Planned provider: ${worker.provider}. Reviewer: ${worker.reviewer}. Not connected.`,
      });
    }

    for (const projectId of region.projectIds ?? []) {
      const project = SAMPLE_PROJECTS.find((p) => p.id === projectId);
      if (!project) continue;
      members.push({
        id: `project:${project.id}`,
        label: project.name,
        kind: "project",
        status: project.status,
        regionId: region.id,
        route: "/projects",
        detail: `${project.healthText}. ${project.tasksOpen} open, ${project.tasksDone} done (recorded sample counts).`,
      });
    }

    members.forEach((member, index) => {
      const spot = ring(region.cx, region.cy, region.radius, index, members.length);
      cells.push({ ...member, x: spot.x, y: spot.y });
    });
  }
  return cells;
}

export const BRAIN_CELLS: BrainCell[] = buildCells();
export const CELL_BY_ID = new Map(BRAIN_CELLS.map((c) => [c.id, c]));

function edge(source: string, target: string, label: string): BrainEdge | null {
  if (!CELL_BY_ID.has(source) || !CELL_BY_ID.has(target)) return null;
  return { id: `${source}->${target}`, source, target, label };
}

export const BRAIN_EDGES: BrainEdge[] = [
  edge("room:reception", "room:owner-desk", "escalates decisions"),
  edge("room:reception", "room:work-board", "files requests"),
  edge("room:owner-desk", "room:approvals", "approves actions"),
  edge("room:work-board", "room:project-rooms", "assigns work"),
  edge("room:project-rooms", "project:p1", "contains project record"),
  edge("room:project-rooms", "project:p2", "contains project record"),
  edge("room:project-rooms", "project:p3", "contains project record"),
  edge("room:safe-highways", "project:p1", "programme oversight record"),
  edge("worker:x1", "room:reception", "handles requests (planned)"),
  edge("worker:x2", "worker:x1", "independent review (planned)"),
  edge("worker:x3", "room:finance", "cost rollup (planned)"),
  edge("room:finance", "room:subscriptions", "tracks spend"),
  edge("room:records", "room:legal", "holds obligations"),
  edge("room:systems", "room:safe-highways", "read-only link (not enabled)"),
  edge("room:build-testing", "room:health", "release and recovery evidence"),
  edge("room:brain", "room:project-rooms", "maps projects"),
  edge("room:skills", "room:office-team", "approved procedures"),
  edge("room:idea-garage", "room:owner-desk", "raises contenders"),
].filter((e): e is BrainEdge => e !== null);

export const KIND_COLORS: Record<BrainKind, string> = {
  room: "#38bdf8",
  worker: "#ec4899",
  project: "#22c55e",
};

export const KIND_LABELS: Record<BrainKind, string> = {
  room: "Office room",
  worker: "Worker role (planned)",
  project: "Project record",
};

export const STATUS_LABELS: Record<StatusTone, string> = {
  green: "Verified in a stated scope",
  blue: "Active",
  yellow: "Needs input",
  red: "Stop",
  grey: "Planned / not connected",
};

/** Brain silhouette drawn in a 400 x 300 space and scaled x2 by the view. */
export const BRAIN_OUTLINE =
  "M200 84 C145 28 48 48 42 126 C5 155 20 224 72 232 C90 286 156 290 200 250 C244 290 310 286 328 232 C380 224 395 155 358 126 C352 48 255 28 200 84Z";

export const BRAIN_GYRI = [
  "M200 82V250",
  "M80 125 C125 115 145 142 132 176 C120 206 148 214 160 200",
  "M320 125 C275 115 255 142 268 176 C280 206 252 214 240 200",
  "M100 220 C145 190 166 214 158 252",
  "M300 220 C255 190 234 214 242 252",
  "M62 168 C96 158 110 178 104 198",
  "M338 168 C304 158 290 178 296 198",
];
