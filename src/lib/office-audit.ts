/**
 * Whole-office audit — CLIENT-SAFE, PURE.
 *
 * Enumerates every canonical room (office map + auxiliary pages) and every
 * installed skill without the three-skill prompt cap. Each room reports what
 * was actually read in this request, which installed procedures exist, which
 * inputs/tools are missing and the next task. It never marks anything
 * live-tested: owner verification stays separate.
 */
import { ROOM_TARGETS, roomActions, type RoomSnapshot, type RoomTarget } from "./room-snapshot";
import { OFFICE_SKILLS, SKILLS_REGISTRY_VERSION, skillsForRoute } from "./office-skills";

export type OfficeAuditCommand = "run" | "status" | null;
export type RoomAuditStatus = "ready" | "partial" | "blocked" | "reserved";

export interface BuildPipelineState {
  /** Server can read the GitHub token (value never exposed). */
  tokenPresent: boolean;
  /** CANX_CODEX_ENABLED is exactly "true" on the Office server. */
  enabled: boolean;
  /** Result of a read-only workflow-run listing, when attempted. */
  liveCheck: "ok" | "failed" | "not-attempted";
  detail: string;
}

export interface RoomAudit {
  route: string;
  label: string;
  number: string | null;
  status: RoomAuditStatus;
  sourcesRead: string[];
  sourcesNotRead: string[];
  skillsInstalled: number;
  skillsFullyConnected: number;
  missingInputs: string[];
  actions: string[];
  nextTask: string;
}

export interface OfficeAuditReport {
  registryVersion: string;
  checkedAt: string;
  rooms: RoomAudit[];
  totals: { rooms: number; ready: number; partial: number; blocked: number; reserved: number; skillsInstalled: number; skillsFullyConnected: number };
  build: BuildPipelineState;
  liveTested: false;
}

const PHRASE = /\b(?:follow|run|check|audit|review)\b.*\b(?:all|every|whole|entire)\b.*\b(?:rooms?|office)\b|\b(?:whole|entire|full)\s+office\s+(?:audit|check|review|skills?)\b/i;

export function parseOfficeAuditCommand(text: string): OfficeAuditCommand {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t || t.length > 300 || !PHRASE.test(t)) return null;
  if (/\bsubscriptions?\s+room\b/i.test(t)) return null; // room-specific command handles it
  if (/\breversible save test\b/i.test(t)) return null; // Build & Testing room check is separate
  if (/\b(?:do not|don't|dont|never|not now)\b/i.test(t) || /\b(?:if|would|could)\b.*\b(?:run|check|audit|review|follow)\b/i.test(t)) return null;
  if (/\?$/.test(t) || /\b(?:have|did|has)\b.*\b(?:run|checked|audited|reviewed|followed)\b/i.test(t)) return "status";
  return "run";
}

function auditRoom(target: RoomTarget, snap: RoomSnapshot | null): RoomAudit {
  const skills = skillsForRoute(target.route).filter((s) => s.instructionReady);
  const missing = [...new Set(skills.flatMap((s) => s.missingInputs))];
  const actions = roomActions(target.route).map((a) => a.label);
  const nonStatic = target.sources.filter((s) => s.kind !== "static");
  const read = snap ? snap.sources.filter((s) => s.kind !== "static" && s.status === "read").map((s) => s.label) : [];
  const notRead = snap
    ? snap.sources.filter((s) => s.kind !== "static" && s.status !== "read").map((s) => `${s.label} (${s.status}${s.detail ? `: ${s.detail}` : ""})`)
    : nonStatic.map((s) => `${s.label} (room could not be read)`);
  const base = { route: target.route, label: target.label, number: target.number, sourcesRead: read, sourcesNotRead: notRead, skillsInstalled: skills.length, skillsFullyConnected: skills.filter((s) => s.toolConnected).length, missingInputs: missing, actions };
  if (target.reserved) return { ...base, status: "reserved", nextTask: "None — reserved room; no worker or capability is installed." };
  if (!snap || snap.overall === "failed") return { ...base, status: "blocked", nextTask: "Sign in as owner with two-step verification and re-run; the room's saved records could not be read." };
  if (notRead.length) return { ...base, status: "partial", nextTask: `Make readable: ${notRead[0]}.` };
  if (missing.length) return { ...base, status: "partial", nextTask: `Connect or supply: ${missing[0]}.` };
  return { ...base, status: "ready", nextTask: "Owner to open this room signed-in on the current build to record verification." };
}

export function buildOfficeAudit(input: { snapshots: Map<string, RoomSnapshot | null>; build: BuildPipelineState; checkedAt: string; targets?: RoomTarget[] }): OfficeAuditReport {
  const rooms = (input.targets ?? ROOM_TARGETS).map((t) => auditRoom(t, input.snapshots.get(t.route) ?? null));
  const installed = OFFICE_SKILLS.filter((s) => s.instructionReady);
  const count = (s: RoomAuditStatus) => rooms.filter((r) => r.status === s).length;
  return {
    registryVersion: SKILLS_REGISTRY_VERSION,
    checkedAt: input.checkedAt,
    rooms,
    totals: { rooms: rooms.length, ready: count("ready"), partial: count("partial"), blocked: count("blocked"), reserved: count("reserved"), skillsInstalled: installed.length, skillsFullyConnected: installed.filter((s) => s.toolConnected).length },
    build: input.build,
    liveTested: false,
  };
}

export function buildPipelineLine(b: BuildPipelineState): string {
  if (!b.tokenPresent || !b.enabled) return `Build handoff (GitHub → Codex draft change): not connected — ${[!b.tokenPresent && "server GitHub token missing", !b.enabled && "CANX_CODEX_ENABLED not exactly true"].filter(Boolean).join("; ")}.`;
  if (b.liveCheck === "ok") return "Build handoff (GitHub → Codex draft change): configured, and a read-only workflow listing just succeeded. Builds create draft changes only; nothing is merged or published by Elsie.";
  return `Build handoff: configured but the live workflow read ${b.liveCheck === "failed" ? `failed (${b.detail})` : "was not attempted"}.`;
}

export function formatOfficeAudit(r: OfficeAuditReport): string {
  const t = r.totals;
  const head = `Whole-office check, ${r.checkedAt}: ${t.rooms} rooms — ${t.ready} ready, ${t.partial} partial, ${t.blocked} blocked, ${t.reserved} reserved. ${t.skillsInstalled} installed procedures (${t.skillsFullyConnected} with every input connected). Nothing was marked live-tested.`;
  const rows = r.rooms.map((x) => `${x.number ? `${x.number} ` : ""}${x.label}: ${x.status}. Read: ${x.sourcesRead.join(", ") || "none"}.${x.sourcesNotRead.length ? ` Not read: ${x.sourcesNotRead.join("; ")}.` : ""} Skills ${x.skillsInstalled}.${x.missingInputs.length ? ` Missing: ${x.missingInputs.slice(0, 3).join("; ")}.` : ""} Next: ${x.nextTask}`);
  return [head, buildPipelineLine(r.build), ...rows].join("\n");
}
