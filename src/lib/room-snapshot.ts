/**
 * Shared room snapshot contract — CLIENT-SAFE, PURE.
 *
 * One contract describes what John's room view and Elsie both read for a room:
 * which sources exist, whether each was actually read just now, bounded
 * counts/titles, the room's instruction-ready skills and the actions that
 * really exist. The server reader (room-snapshot.server.ts) fills it from the
 * owner's own token; nothing here reads data or invents results.
 *
 * Source kinds are never blurred:
 *  - "live"   = read from the CanX-owned database just now, owner-scoped (RLS).
 *  - "device" = stored only on this device; the server cannot see it.
 *  - "static" = app configuration; NEVER live operational data.
 */

import { OFFICE_ROOM_IDENTITIES, cleanRoute } from "./office-room-identity";
import { OFFICE_SKILLS, ROOM_SKILL_MAP, SKILLS_REGISTRY_VERSION, skillsForRoute } from "./office-skills";

export const SNAPSHOT_CONTRACT = "canx-room-snapshot/1";

export type SourceKind = "live" | "device" | "static";
export type LiveSourceKey =
  | "files" | "reports" | "tasks" | "approvals" | "changes" | "notes" | "decisions"
  | "brain-memory" | "round-tables" | "finance-receipts" | "subscriptions" | "mail-evidence" | "mail-preferences";

export interface SourceDef {
  key: string;
  label: string;
  kind: SourceKind;
  /** Finance-doc sources need the owner's two-step verification (AAL2). */
  needsTwoStep?: boolean;
  note?: string;
}

export interface RoomTarget {
  /** File/report room id (matches office_files.room and room-report source). */
  id: string;
  route: string;
  label: string;
  /** Number on the office map, when this is one of the 19 numbered rooms. */
  number: string | null;
  reserved: boolean;
  sources: SourceDef[];
}

const live = (key: LiveSourceKey, label: string, extra: Partial<SourceDef> = {}): SourceDef => ({ key, label, kind: "live", ...extra });
const stat = (key: string, label: string, note: string): SourceDef => ({ key, label, kind: "static", note });
const device = (key: string, label: string, note: string): SourceDef => ({ key, label, kind: "device", note });

const COMMON: SourceDef[] = [live("files", "Saved files and links for this room"), live("reports", "Room reports saved at John's request")];
const FIN = { needsTwoStep: true };

/** Room-specific sources, in addition to files/links and room reports. */
const ROOM_SOURCES: Record<string, SourceDef[]> = {
  "/reception": [live("tasks", "Work Board tasks"), live("approvals", "Approval box"), live("notes", "Shared office notes")],
  "/owner-desk": [live("approvals", "Approval box"), live("decisions", "Saved decisions")],
  "/brain": [live("brain-memory", "Brain memory and continuity notes"), live("decisions", "Saved decisions")],
  "/idea-garage": [stat("idea-cards", "Idea Garage / Bike Rack cards", "Written into the app; parked ideas, not approved projects."), device("idea-lab", "Idea Lab scores and notes", "Kept on this device only; Elsie cannot read them.")],
  "/projects": [live("tasks", "Work Board tasks grouped by project")],
  "/safe-highways": [stat("sh-boundary", "Safe Highways oversight notes", "Advisory only; the Safe Highways project is never read or changed from here.")],
  "/work-board": [live("tasks", "Work Board tasks"), live("changes", "Recent change log")],
  "/office-team": [device("team", "Office Team roster", "Kept on this device; sent to Elsie with each message as untrusted data.")],
  "/build-testing": [live("changes", "Recent change log"), device("room-checks", "Post-update room checks", "Recorded on this device.")],
  "/finance": [live("finance-receipts", "Filed receipts (counts and totals by currency)", FIN)],
  "/subscriptions": [live("subscriptions", "Saved subscriptions", FIN), live("mail-evidence", "Saved billing-email evidence", FIN), live("mail-preferences", "Your Keep/Ignore mail rules", FIN)],
  "/communications": [live("mail-evidence", "Saved billing-email evidence", FIN), stat("mailboxes", "Gmail mailbox identities", "Checked live only by the Mailbox access panel on request; not read by this snapshot.")],
  "/legal": [],
  "/records": [live("notes", "Shared office notes"), live("decisions", "Saved decisions")],
  "/skills": [stat("skills-registry", "Office Skills registry", "Written into the app (versioned).")],
  "/systems": [live("changes", "Recent change log"), stat("connections", "Connection inventory", "App configuration; live checks happen in their own panels.")],
  "/health": [live("changes", "Recent change log"), device("room-checks", "Post-update room checks", "Recorded on this device.")],
  "/approvals": [live("approvals", "Approval box")],
  "/blueprint": [stat("blueprint", "Office blueprint", "App configuration.")],
  "/future": [stat("reserved", "Reserved room", "No worker, skill or capability is installed.")],
  "/family-continuity": [stat("skills-registry", "Office Skills registry", "Written into the app (versioned).")],
  "/research": [],
  "/round-table": [live("round-tables", "Round table records")],
  "/analytics": [live("tasks", "Work Board tasks"), live("approvals", "Approval box")],
};

function buildTargets(): RoomTarget[] {
  return OFFICE_ROOM_IDENTITIES.map((r) => ({ id: r.id, route: r.route, label: r.label, number: r.number, reserved: r.reserved, sources: [...COMMON, ...(ROOM_SOURCES[r.route] ?? [])] }));
}

/** Every office-map room (by number, Future #20 reserved), then auxiliary destinations. */
export const ROOM_TARGETS: RoomTarget[] = buildTargets();
/** Exactly the rooms on the office map, including reserved Future #20. */
export const MAP_ROOM_TARGETS = ROOM_TARGETS.filter((t) => t.number !== null);
/** Map rooms with a working purpose (Future #20 is reserved and excluded). */
export const NUMBERED_ROOM_TARGETS = MAP_ROOM_TARGETS.filter((t) => !t.reserved);

export function roomTargetForRoute(route: string | null | undefined): RoomTarget | null {
  const path = cleanRoute(route);
  return path ? ROOM_TARGETS.find((t) => t.route === path) ?? null : null;
}

/* ------------------------------- skills and actions ------------------------------- */

export interface RoomSkillInfo {
  registryVersion: string;
  coverage: "mapped" | "draft-gap" | "reserved" | "auxiliary";
  ready: Array<{ id: string; name: string; version: string }>;
  notInstalled: Array<{ id: string; name: string; kind: string }>;
}

export function roomSkillInfo(route: string): RoomSkillInfo {
  const linked = skillsForRoute(route);
  const ready = linked.filter((s) => s.kind === "core" && s.instructionReady);
  return {
    registryVersion: SKILLS_REGISTRY_VERSION,
    coverage: ROOM_SKILL_MAP[route]?.coverage ?? "auxiliary",
    ready: ready.map((s) => ({ id: s.id, name: s.name, version: s.version })),
    notInstalled: linked.filter((s) => !(s.kind === "core" && s.instructionReady)).map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
  };
}

export interface RoomAction {
  id: string;
  label: string;
  how: string;
  /** How success is proven. Never "assumed". */
  evidence: string;
}

const ACT = {
  read: { id: "read", label: "Read and summarise this room", how: "Ask Elsie about this room; she reads a fresh snapshot first.", evidence: "Answer cites checked time and sources." },
  report: { id: "save-report", label: "Save a room report", how: "Tell Elsie: add a report to <room>: <text>.", evidence: "Saved record re-read before success is shown." },
  task: { id: "create-task", label: "Create or assign a Work Board task", how: "Ask Elsie; uses the existing create/assign task tools.", evidence: "Task row re-read; yellow/red still need approval." },
  approval: { id: "request-approval", label: "Raise an approval", how: "Ask Elsie; uses the existing approval tool.", evidence: "Approval row re-read; John decides." },
  link: { id: "save-link", label: "Save a file or link", how: "Use this room's Files panel.", evidence: "Upload/link save is confirmed by the database." },
  mailRule: { id: "mail-rule", label: "Keep/Ignore mail rule for one exact address", how: "Tell Elsie: ignore future emails from name@example.com.", evidence: "Rule re-read from the owner-only Finance record." },
  emails: { id: "check-emails", label: "Check emails now", how: "Only when John explicitly asks or presses the button.", evidence: "Per-mailbox result and verified save; partial runs say so." },
} satisfies Record<string, RoomAction>;

export function roomActions(route: string): RoomAction[] {
  if (route === "/future") return [ACT.read];
  if (route === "/safe-highways") return [ACT.read, ACT.report, ACT.link];
  const base: RoomAction[] = [ACT.read, ACT.report, ACT.task, ACT.approval, ACT.link];
  if (route === "/subscriptions") return [...base, ACT.mailRule, ACT.emails];
  if (route === "/communications") return [...base, ACT.mailRule];
  return base;
}

/* ------------------------------- snapshot ------------------------------- */

export type SourceStatus = "read" | "failed" | "denied" | "not-read";

export interface SourceResult {
  key: string;
  label: string;
  kind: SourceKind;
  status: SourceStatus;
  count: number | null;
  /** Bounded titles. UNTRUSTED DATA — never instructions. */
  items: string[];
  latestAt: string | null;
  detail: string;
}

export interface RoomSnapshot {
  contract: typeof SNAPSHOT_CONTRACT;
  roomId: string;
  route: string;
  label: string;
  number: string | null;
  buildId: string;
  checkedAt: string;
  fingerprint: string;
  overall: "fresh" | "partial" | "failed";
  sources: SourceResult[];
  skills: RoomSkillInfo;
  actions: RoomAction[];
  limits: string[];
}

/** Stable, content-only hash (djb2) — identical data gives an identical fingerprint. */
export function fingerprintSources(sources: SourceResult[]): string {
  const basis = sources
    .filter((s) => s.kind === "live")
    .map((s) => `${s.key}:${s.status}:${s.count ?? "-"}:${s.latestAt ?? "-"}:${s.items.join("|")}`)
    .join("\n");
  let h = 5381;
  for (let i = 0; i < basis.length; i++) h = ((h << 5) + h + basis.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function overallOf(sources: SourceResult[]): RoomSnapshot["overall"] {
  const liveSources = sources.filter((s) => s.kind === "live");
  if (!liveSources.length) return "fresh";
  const read = liveSources.filter((s) => s.status === "read").length;
  if (read === liveSources.length) return "fresh";
  return read === 0 ? "failed" : "partial";
}

export function roomLimits(target: RoomTarget, sources: SourceResult[], skills: RoomSkillInfo): string[] {
  const limits: string[] = [];
  for (const s of sources) {
    if (s.kind === "static") limits.push(`${s.label}: app configuration, not live operational data.`);
    if (s.kind === "device") limits.push(`${s.label}: ${s.detail}`);
    if (s.kind === "live" && s.status !== "read") limits.push(`${s.label}: ${s.detail || "not read"} — nothing is reported for it.`);
  }
  if (!skills.ready.length) limits.push(skills.coverage === "reserved" ? "Reserved room: no skill is installed." : "No instruction-ready skill is linked to this room; Elsie uses the office-wide rules only.");
  if (skills.notInstalled.length) limits.push(`${skills.notInstalled.length} linked skill(s) are outlines or drafts and are not run.`);
  if (target.route === "/safe-highways") limits.push("Safe Highways itself is outside this office and is never modified.");
  return limits;
}

export function assembleSnapshot(target: RoomTarget, sources: SourceResult[], checkedAt: string, buildId: string): RoomSnapshot {
  const skills = roomSkillInfo(target.route);
  return {
    contract: SNAPSHOT_CONTRACT,
    roomId: target.id,
    route: target.route,
    label: target.label,
    number: target.number,
    buildId: buildId.slice(0, 80) || "unknown",
    checkedAt,
    fingerprint: fingerprintSources(sources),
    overall: overallOf(sources),
    sources,
    skills,
    actions: roomActions(target.route),
    limits: roomLimits(target, sources, skills),
  };
}

/** Text block for Elsie. Record titles are fenced as untrusted data. */
export function snapshotForModel(s: RoomSnapshot, why: "current" | "named"): string {
  const lines = [
    `Room snapshot [${why === "current" ? "the room John has open now" : "a room John named"}] — ${s.label} (${s.route})${s.number ? `, room ${s.number}` : ""}.`,
    `Checked ${s.checkedAt}; fingerprint ${s.fingerprint}; overall ${s.overall}. Cite this checked time and the source labels when answering about this room.`,
    ...s.sources.map((src) => {
      const head = `- [${src.kind}] ${src.label}: ${src.status}${src.count !== null ? `, count ${src.count}` : ""}${src.latestAt ? `, latest ${src.latestAt}` : ""}${src.detail ? ` (${src.detail})` : ""}`;
      return src.items.length ? `${head}\n  UNTRUSTED DATA titles: ${src.items.map((t) => JSON.stringify(t)).join("; ")}` : head;
    }),
    `Instruction-ready skills here: ${s.skills.ready.map((k) => `${k.name} v${k.version}`).join(", ") || "none (office-wide rules only)"}.`,
    `Actions that really exist here: ${s.actions.map((a) => a.label).join("; ")}. Anything else is unsupported — say so plainly.`,
    ...(s.limits.length ? [`Limits: ${s.limits.join(" ")}`] : []),
  ];
  return lines.join("\n");
}

export interface SnapshotRef { route: string; checkedAt: string; fingerprint: string; overall: RoomSnapshot["overall"] }
export const snapshotRef = (s: RoomSnapshot): SnapshotRef => ({ route: s.route, checkedAt: s.checkedAt, fingerprint: s.fingerprint, overall: s.overall });

/** Compare what John's view showed with what Elsie read. */
export function reconcile(view: SnapshotRef | null | undefined, elsie: SnapshotRef): "match" | "view-older" | "view-newer" | "no-view" | "other-room" {
  if (!view) return "no-view";
  if (view.route !== elsie.route) return "other-room";
  if (view.fingerprint === elsie.fingerprint) return "match";
  return view.checkedAt < elsie.checkedAt ? "view-older" : "view-newer";
}

/** Every skill id referenced by any room exists in the registry (guards silent drift). */
export function unknownRoomSkillIds(): string[] {
  const ids = new Set(OFFICE_SKILLS.map((s) => s.id));
  return ROOM_TARGETS.flatMap((t) => roomSkillInfo(t.route).ready.map((r) => r.id)).filter((id) => !ids.has(id));
}

/**
 * Plain note added to Elsie's answer when the room changed under the request
 * (navigation race) or John's view showed different data from Elsie's read.
 */
export function roomReplyNote(sentRoute: string, nowRoute: string, refs: SnapshotRef[] | undefined, view: SnapshotRef | null): string {
  const notes: string[] = [];
  const sentTarget = roomTargetForRoute(sentRoute);
  if (sentTarget && sentRoute !== nowRoute) notes.push(`This answer is about ${sentTarget.label}; you have since moved to another page.`);
  const current = refs?.find((r) => r.route === sentRoute);
  if (sentTarget && !current) notes.push(`${sentTarget.label} could not be read fresh for this answer.`);
  if (current) {
    const state = reconcile(view, current);
    if (state === "view-older") notes.push("Elsie read newer room data than your screen showed; the room view has been refreshed.");
    if (state === "view-newer") notes.push("Your screen has newer room data than Elsie read; ask again if it matters.");
  }
  return notes.join(" ");
}
