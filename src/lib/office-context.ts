/**
 * Deterministic office context. Built only from records that exist in this
 * repository. Nothing here is measured, live, or inferred.
 */

import {
  ROOMS,
  SAMPLE_APPROVALS,
  SAMPLE_PROJECTS,
  SAMPLE_STATUS,
  SAMPLE_WORKERS,
  SAMPLE_WORK_ITEMS,
  STATUS_HELP,
  type StatusTone,
} from "./office-data";

export interface OfficeContext {
  generatedAt: string;
  destinations: number;
  priorities: string[];
  blockers: string[];
  redStops: string[];
  needsInput: string[];
  projects: string[];
  workers: string[];
  approvals: string[];
  boundaries: string[];
}

const BOUNDARIES = [
  "Sample office records are labelled demonstration data; records John saved himself are his own real notes.",
  "Records saved while signed out of the CanX account stay on this device only.",
  "No external connections, payments, mailboxes, or deployments are enabled.",
  "Safe Highways and Trail Tales are outside this project and are never modified.",
];

export function buildOfficeContext(): OfficeContext {
  const tone = (t: StatusTone) => SAMPLE_STATUS.filter((s) => s.tone === t);
  return {
    generatedAt: new Date().toISOString(),
    destinations: ROOMS.length,
    priorities: SAMPLE_WORK_ITEMS.filter((w) => w.status === "blue" || w.status === "yellow").map(
      (w) => `${w.title} (${w.project})`,
    ),
    blockers: SAMPLE_WORK_ITEMS.filter((w) => w.blocker).map((w) => `${w.title}: ${w.blocker}`),
    redStops: tone("red").map((s) => `${s.title}${s.cause ? ` — ${s.cause}` : ""}`),
    needsInput: tone("yellow").map((s) => `${s.title}${s.question ? ` — ${s.question}` : ""}`),
    projects: SAMPLE_PROJECTS.map((p) => `${p.name} — ${p.healthText} (${p.tasksOpen} open, ${p.tasksDone} done)`),
    workers: SAMPLE_WORKERS.map((w) => `${w.role} — provider: ${w.provider}; reviewer: ${w.reviewer}`),
    approvals: SAMPLE_APPROVALS.map((a) => `${a.action} — ${a.risk}; ${a.requestedAt}`),
    boundaries: BOUNDARIES,
  };
}

/** A record John created himself — never demonstration data. */
export interface OwnerRecord {
  kind: string;
  title: string;
  detail?: string;
  provenance: string;
}

export function contextToText(context: OfficeContext, ownerRecords: OwnerRecord[] = []): string {
  // Provenance is carried per record. Sample rows are marked sample; John's own
  // records are marked as his and must not be called demonstration data.
  const list = (title: string, items: string[]) =>
    items.length
      ? `${title} [provenance: sample]:\n${items.map((i) => `- ${i}`).join("\n")}`
      : `${title} [provenance: sample]: none recorded`;
  const owner = ownerRecords.length
    ? `Records created by John [provenance: owner — NOT demonstration data]:\n${ownerRecords
        .map((r) => `- (${r.kind}, ${r.provenance}) ${r.title}${r.detail ? ` — ${r.detail}` : ""}`)
        .join("\n")}`
    : "Records created by John [provenance: owner]: none saved yet";
  return [
    `CanX Office context (${context.destinations} destinations).`,
    list("Priorities", context.priorities),
    list("Blockers", context.blockers),
    list("Red stops", context.redStops),
    list("Needs input", context.needsInput),
    list("Projects", context.projects),
    list("Worker roles", context.workers),
    list("Approval records", context.approvals),
    owner,
    `Boundaries [provenance: system fact]:\n${context.boundaries.map((b) => `- ${b}`).join("\n")}`,
    `Status colour meanings: ${Object.entries(STATUS_HELP)
      .map(([k, v]) => `${k} = ${v}`)
      .join("; ")}`,
  ].join("\n\n");
}

/** What the office can truthfully say about its own connections. */
export interface BriefingConnections {
  /** The CanX-owned database answered as the verified owner. */
  databaseConnected: boolean;
  /** A live provider health check passed for the Office Manager. */
  managerVerified: boolean;
}

/**
 * Plain-language briefing generated without any AI. Always safe to show.
 * It must never claim "no live connections" while connections are verified.
 */
export function localBriefing(context: OfficeContext, connections?: BriefingConnections): string[] {
  const lines: string[] = [];
  const connectionText = !connections
    ? "connections not checked yet"
    : connections.databaseConnected && connections.managerVerified
      ? "the CanX-owned database and the Office Manager connection are both verified"
      : connections.databaseConnected
        ? "the CanX-owned database is verified; the Office Manager connection is not verified"
        : connections.managerVerified
          ? "the Office Manager connection is verified; the CanX-owned database is not verified for this session"
          : "no verified connections in this session";
  lines.push(`The office has ${context.destinations} destinations; ${connectionText}.`);
  if (context.redStops.length) lines.push(`Stop items: ${context.redStops.join("; ")}.`);
  if (context.needsInput.length) lines.push(`Waiting on you: ${context.needsInput.join("; ")}.`);
  if (context.priorities.length) lines.push(`Moving now: ${context.priorities.slice(0, 4).join("; ")}.`);
  if (context.blockers.length) lines.push(`Blocked: ${context.blockers.join("; ")}.`);
  lines.push("The items listed above come from the office's recorded demonstration data, not measured activity. The Office Manager itself is given live records only.");
  return lines;
}
