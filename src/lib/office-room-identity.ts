/**
 * Canonical office room identity — CLIENT-SAFE, PURE.
 *
 * The office map (OFFICE_MAP_ROOMS) is the source of truth for the numbered
 * destinations; the older ROOMS directory supplies colours/icons where it has
 * them, plus auxiliary pages (Brain, Projects, Skills). Every surface that
 * needs "which room is this?" — room header, saved files, room reports,
 * Elsie's room commands and the room snapshot — uses this one adapter, so an
 * unknown page is never silently treated as Reception.
 */
import type { LucideIcon } from "lucide-react";
import { MessagesSquare, BarChart3 } from "lucide-react";
import { ROOMS } from "./office-data";
import { OFFICE_MAP_ROOMS } from "./office-map";

export interface OfficeRoomIdentity {
  /** Matches office_files.room and the room-report source. */
  id: string;
  route: string;
  label: string;
  shortLabel: string;
  purpose: string;
  icon: LucideIcon;
  /** CSS colour; map-only rooms use the theme's foreground colour. */
  color: string;
  /** Office map number ("01".."20"), or null for auxiliary pages. */
  number: string | null;
  /** Reserved room: no worker, skill or capability installed. */
  reserved: boolean;
}

/** File/report ids for map rooms that the older directory does not know. */
const ID_FOR_ROUTE: Record<string, string> = {
  "/family-continuity": "family-continuity", "/research": "research", "/round-table": "round-table", "/analytics": "analytics",
};

function build(): OfficeRoomIdentity[] {
  const out: OfficeRoomIdentity[] = [];
  const seen = new Set<string>();
  const push = (r: OfficeRoomIdentity) => { if (!seen.has(r.route)) { seen.add(r.route); out.push(r); } };
  const sorted = [...OFFICE_MAP_ROOMS].sort((a, b) => a.number.localeCompare(b.number));
  for (const m of sorted) {
    const legacy = ROOMS.find((r) => r.route === m.route);
    push({
      id: ID_FOR_ROUTE[m.route] ?? legacy?.id ?? m.route.slice(1),
      route: m.route, label: m.label, shortLabel: legacy?.shortLabel ?? m.label.split(/[,/]/)[0]!.trim(),
      purpose: legacy?.purpose ?? m.purpose, icon: legacy?.icon ?? m.icon, color: legacy?.color ?? "currentColor",
      number: m.number, reserved: m.route === "/future",
    });
  }
  for (const r of ROOMS) push({ id: r.id, route: r.route, label: r.label, shortLabel: r.shortLabel, purpose: r.purpose, icon: r.icon, color: r.color, number: null, reserved: false });
  push({ id: "round-table", route: "/round-table", label: "Round Table", shortLabel: "Round Table", purpose: "Meeting agenda, notes, decisions, owners and due dates.", icon: MessagesSquare, color: "currentColor", number: null, reserved: false });
  push({ id: "analytics", route: "/analytics", label: "Analytics", shortLabel: "Analytics", purpose: "Evidence-based office measures.", icon: BarChart3, color: "currentColor", number: null, reserved: false });
  return out;
}

/** Map rooms first (by number), then auxiliary pages. */
export const OFFICE_ROOM_IDENTITIES: OfficeRoomIdentity[] = build();
export const MAP_ROOM_IDENTITIES = OFFICE_ROOM_IDENTITIES.filter((r) => r.number !== null);

export function cleanRoute(route: string | null | undefined): string | null {
  if (typeof route !== "string") return null;
  const clean = route.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  return clean === "/" ? "/reception" : clean;
}

/** Exact route match only. Unknown pages return null — never Reception. */
export function roomIdentityForRoute(route: string | null | undefined): OfficeRoomIdentity | null {
  const path = cleanRoute(route);
  return path ? OFFICE_ROOM_IDENTITIES.find((r) => r.route === path) ?? null : null;
}

const normalize = (text: string) => text.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const EXTRA_ALIASES: Record<string, string[]> = {
  subscriptions: ["subscription", "subscription watch"],
  "family-continuity": ["family continuity", "skills and training", "training"],
  research: ["research"],
};

/** The room John names in plain words; the longest matching name wins. */
export function namedRoomIdentity(text: string): OfficeRoomIdentity | null {
  const words = ` ${normalize(text)} `;
  const hits = OFFICE_ROOM_IDENTITIES.flatMap((room) =>
    [room.shortLabel, room.id, ...room.label.split(/\s*[/,&]\s*|\s+and\s+/), room.label, ...(EXTRA_ALIASES[room.id] ?? [])]
      .map((a) => normalize(a)).filter((a) => a.length > 2).map((alias) => ({ room, alias })))
    .filter(({ alias }) => words.includes(` ${alias} `))
    .sort((a, b) => b.alias.length - a.alias.length);
  return hits[0]?.room ?? null;
}
