/**
 * Room briefs and the Office tour — PURE and CLIENT-SAFE.
 *
 * A brief is what an assistant needs to explain one room from evidence: why it
 * exists, where its information comes from, which procedures are installed and
 * how far each one is proven, how it connects to other rooms, and what is NOT
 * known. Everything is read from the Office's own code sources. Nothing here
 * reads saved records; current contents come from the records tools.
 *
 * Honesty rules built in:
 * - "Documented" (written in the app) is never reported as "verified".
 * - A procedure counts as owner-verified only when its own record says so.
 * - Missing information is listed, never filled in.
 */

import { BRAIN_LINKS, ROOMS } from "@/lib/office-data";
import { OFFICE_MAP_ROOMS, clockwiseOfficeRooms, type LabelPositions } from "@/lib/office-map";
import { roomIdentityForRoute } from "@/lib/office-room-identity";
import { OFFICE_SKILLS, SKILLS_REGISTRY_VERSION, skillsForRoute, type OfficeSkill } from "@/lib/office-skills";
import { captureTier, type RoomTier } from "@/lib/room-capture";
import { ROOM_TARGETS, roomActions, roomSkillInfo, type RoomAction, type SourceDef } from "@/lib/room-snapshot";

/* ----------------------------------- tour ----------------------------------- */

export type TourGroup = "office-manager" | "clockwise" | "centre" | "other";

export interface TourStop {
  order: number;
  /** "elsie" for the Office Manager, otherwise the room route. */
  key: string;
  route: string | null;
  label: string;
  group: TourGroup;
}

/**
 * The established Synopsis order from the Office navigation: Elsie, then the
 * map rooms clockwise from Reception, then the Brain and Analytics wall, then
 * the remaining Office pages, then the Round Table.
 *
 * Saved label positions live only on John's own device, so a server has the
 * default clockwise order. Pass positions in when they are known.
 */
export function officeTour(positions: LabelPositions = {}): TourStop[] {
  const stops: Omit<TourStop, "order">[] = [
    { key: "elsie", route: null, label: "Elsie — Office Manager", group: "office-manager" },
    ...clockwiseOfficeRooms(positions).map((room) => ({ key: room.route, route: room.route, label: room.label, group: "clockwise" as const })),
    { key: "/brain", route: "/brain", label: "CanX Brain", group: "centre" },
    { key: "/analytics", route: "/analytics", label: "Analytics Control Wall", group: "centre" },
    ...ROOMS.filter((room) => room.id !== "brain" && !OFFICE_MAP_ROOMS.some((mapped) => mapped.route === room.route)).map((room) => ({
      key: room.route,
      route: room.route,
      label: room.shortLabel,
      group: "other" as const,
    })),
    { key: "/round-table", route: "/round-table", label: "Round Table", group: "other" },
  ];
  return stops.map((stop, index) => ({ ...stop, order: index + 1 }));
}

/* ----------------------------------- briefs ----------------------------------- */

/** How far a procedure is proven, from weakest to strongest. */
export type SkillAssurance = "outline" | "instructions-only" | "inputs-connected" | "owner-verified";

export function skillAssurance(skill: { instructionReady: boolean; toolConnected: boolean; liveTested: boolean }): SkillAssurance {
  if (skill.liveTested) return "owner-verified";
  if (skill.instructionReady && skill.toolConnected) return "inputs-connected";
  if (skill.instructionReady) return "instructions-only";
  return "outline";
}

export interface BriefSkill {
  id: string;
  name: string;
  purpose: string;
  assurance: SkillAssurance;
  missingInputs: string[];
}

export interface RoomConnection {
  route: string;
  label: string;
  relation: string;
  /** Where the connection is written down. */
  source: "brain-map-link" | "shared-skill";
}

export interface RoomBrief {
  route: string;
  label: string;
  number: string | null;
  tourOrder: number;
  previousRoute: string | null;
  nextRoute: string | null;
  purpose: string;
  tier: RoomTier;
  reserved: boolean;
  /** Where the room's information comes from, as documented in the app. */
  sources: Array<{ key: string; label: string; kind: SourceDef["kind"]; needsTwoStep?: boolean; note?: string }>;
  skillRegistryVersion: string;
  skills: BriefSkill[];
  actions: Array<Pick<RoomAction, "id" | "label" | "evidence">>;
  connections: RoomConnection[];
  /** Plain statements of what is not known or not reachable. Never guess past these. */
  limits: string[];
  /** What this brief proves and what it does not. */
  assurance: {
    documentedInCode: true;
    ownerVerifiedSkillCount: number;
    liveRoomCheck: "unknown";
    note: string;
  };
}

/** Brain-map node ids that are rooms, mapped to their routes. */
const NODE_ROUTE: Record<string, string> = {
  reception: "/reception",
  "owner-desk": "/owner-desk",
  brain: "/brain",
  "idea-garage": "/idea-garage",
  "project-rooms": "/projects",
  "safe-highways": "/safe-highways",
  finance: "/finance",
  subscriptions: "/subscriptions",
  systems: "/systems",
  approvals: "/approvals",
};

function connectionsFor(route: string): RoomConnection[] {
  const out: RoomConnection[] = [];
  const seen = new Set<string>();
  const add = (other: string, relation: string, source: RoomConnection["source"]) => {
    if (other === route) return;
    const identity = roomIdentityForRoute(other);
    if (!identity) return;
    const key = `${other}|${relation}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ route: other, label: identity.label, relation, source });
  };
  for (const link of BRAIN_LINKS) {
    const from = NODE_ROUTE[link.source];
    const to = NODE_ROUTE[link.target];
    if (!from || !to) continue;
    if (from === route) add(to, link.label, "brain-map-link");
    if (to === route) add(from, `${link.label} (incoming)`, "brain-map-link");
  }
  for (const skill of skillsForRoute(route)) {
    for (const other of skill.routes) add(other, `shares the procedure "${skill.name}"`, "shared-skill");
  }
  return out;
}

export function roomBrief(route: string, positions: LabelPositions = {}): RoomBrief | null {
  const identity = roomIdentityForRoute(route);
  const target = ROOM_TARGETS.find((t) => t.route === route);
  const tier = captureTier(route);
  if (!identity || !target || !tier) return null;

  const tour = officeTour(positions);
  const index = tour.findIndex((stop) => stop.route === route);
  const previous = tour.slice(0, index).reverse().find((stop) => stop.route !== null);
  const next = tour.slice(index + 1).find((stop) => stop.route !== null);

  const linked = skillsForRoute(route);
  const skills: BriefSkill[] = linked.map((skill) => ({
    id: skill.id,
    name: skill.name,
    purpose: skill.purpose,
    assurance: skillAssurance(skill),
    missingInputs: skill.missingInputs,
  }));
  const info = roomSkillInfo(route);

  const limits: string[] = [];
  if (identity.reserved) limits.push("Reserved room: no worker, skill or capability is installed.");
  if (tier === "two_step") limits.push("Saved data in this room needs the owner's two-step (authenticator) check; assistants see it only inside a window John opens.");
  for (const source of target.sources) {
    if (source.kind === "device") limits.push(`${source.label}: kept on John's device only, so it cannot be retrieved from the server. ${source.note ?? ""}`.trim());
    if (source.kind === "static" && source.note) limits.push(`${source.label}: ${source.note}`);
  }
  const missing = new Set<string>();
  for (const skill of linked) for (const input of skill.missingInputs) missing.add(input);
  for (const input of missing) limits.push(`Missing input for installed procedures: ${input}`);
  if (info.notInstalled.length) limits.push(`Procedures named but not installed: ${info.notInstalled.map((s) => s.name).join(", ")}.`);
  if (linked.length === 0 && !identity.reserved) limits.push("No installed procedure is linked to this room.");

  const connections = connectionsFor(route);
  if (connections.length === 0) limits.push("No documented connection to another room was found in the Brain map or shared procedures.");

  const ownerVerifiedSkillCount = skills.filter((skill) => skill.assurance === "owner-verified").length;
  return {
    route,
    label: identity.label,
    number: identity.number,
    tourOrder: index + 1,
    previousRoute: previous?.route ?? null,
    nextRoute: next?.route ?? null,
    purpose: identity.purpose,
    tier,
    reserved: identity.reserved,
    sources: target.sources.map(({ key, label, kind, needsTwoStep, note }) => ({ key, label, kind, ...(needsTwoStep !== undefined ? { needsTwoStep } : {}), ...(note !== undefined ? { note } : {}) })),
    skillRegistryVersion: SKILLS_REGISTRY_VERSION,
    skills,
    actions: roomActions(route).map(({ id, label, evidence }) => ({ id, label, evidence })),
    connections,
    limits,
    assurance: {
      documentedInCode: true,
      ownerVerifiedSkillCount,
      liveRoomCheck: "unknown",
      note:
        "Everything above is documented in the Office's code. Only procedures marked owner-verified were confirmed by John in real use. Whether the room works today needs a signed-in check on the current build; read current records for live contents.",
    },
  };
}

/** One brief per tour stop that is a room, in tour order. */
export function allRoomBriefs(positions: LabelPositions = {}): RoomBrief[] {
  return officeTour(positions)
    .filter((stop) => stop.route !== null)
    .map((stop) => roomBrief(stop.route!, positions))
    .filter((brief): brief is RoomBrief => brief !== null);
}

/** All installed procedures a brief can name, for completeness checks. */
export function installedSkillCount(): number {
  return OFFICE_SKILLS.filter((skill) => skill.instructionReady).length;
}
