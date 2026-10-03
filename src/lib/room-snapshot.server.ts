/**
 * Room snapshot reader — SERVER ONLY.
 *
 * Reads the exact sources declared for a room in room-snapshot.ts, through the
 * owner's own token so RLS applies. Every source reports its own status; a
 * failed read is reported as failed, never as empty. Finance-doc sources need
 * two-step verification (AAL2) and are denied otherwise. Nothing is written.
 */
import type { BackendConfig } from "./canx-backend.server";
import { IDEA_CARDS } from "./idea-garage";
import { OFFICE_SKILLS } from "./office-skills";
import { roomReportSource } from "./manager-room-commands";
import { assembleSnapshot, type RoomSnapshot, type RoomTarget, type SourceDef, type SourceResult } from "./room-snapshot";

export type SnapshotRest = (config: BackendConfig, token: string, path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; body: unknown }>;

export interface SnapshotRequest {
  config: BackendConfig;
  token: string;
  aal: string;
  target: RoomTarget;
  buildId?: string;
  rest: SnapshotRest;
  now?: () => Date;
}

const MAX_ITEMS = 6;
const text = (v: unknown, max = 140) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
type Row = Record<string, unknown>;

async function rows(req: SnapshotRequest, path: string): Promise<Row[] | null> {
  const res = await req.rest(req.config, req.token, path).catch(() => null);
  return res?.ok && Array.isArray(res.body) ? (res.body as Row[]) : null;
}

function result(def: SourceDef, partial: Partial<SourceResult>): SourceResult {
  return { key: def.key, label: def.label, kind: def.kind, status: "read", count: null, items: [], latestAt: null, detail: "", ...partial };
}
const failed = (def: SourceDef, detail = "could not be read just now") => result(def, { status: "failed", detail });

function fromRows(def: SourceDef, list: Row[] | null, title: (r: Row) => string, at: string): SourceResult {
  if (!list) return failed(def);
  return result(def, {
    count: list.length,
    items: list.slice(0, MAX_ITEMS).map(title).filter(Boolean),
    latestAt: text(list[0]?.[at], 40) || null,
  });
}

async function financeDoc(req: SnapshotRequest, cache: { doc?: Promise<Row | null | "fail"> }): Promise<Row | null | "fail"> {
  cache.doc ??= rows(req, "finance_receipts?select=doc,updated_at&order=created_at.desc&limit=1").then((list) => {
    if (!list) return "fail" as const;
    const doc = list[0]?.["doc"];
    return doc && typeof doc === "object" ? ({ ...(doc as Row), __updated: list[0]?.["updated_at"] } as Row) : null;
  });
  return cache.doc;
}

async function readSource(req: SnapshotRequest, def: SourceDef, cache: { doc?: Promise<Row | null | "fail"> }): Promise<SourceResult> {
  if (def.kind === "static") {
    if (def.key === "idea-cards") return result(def, { count: IDEA_CARDS.length, items: IDEA_CARDS.slice(0, MAX_ITEMS).map((c) => text(c.title)), detail: def.note ?? "" });
    if (def.key === "skills-registry") return result(def, { count: OFFICE_SKILLS.length, detail: def.note ?? "" });
    return result(def, { detail: def.note ?? "" });
  }
  if (def.kind === "device") return result(def, { status: "not-read", detail: def.note ?? "Stored on this device only." });
  if (def.needsTwoStep && req.aal !== "aal2") return result(def, { status: "denied", detail: "needs two-step verification" });
  const id = encodeURIComponent(req.target.id);
  switch (def.key) {
    case "project-register": {
      const { readLocatorsWith } = await import("./project-register.functions");
      const loc = await readLocatorsWith((p, i) => req.rest(req.config, req.token, p, i));
      if (!loc) return failed(def);
      const stages: Record<string, number> = {};
      for (const l of loc.locators) stages[l.stage] = (stages[l.stage] ?? 0) + 1;
      return result(def, { count: loc.locators.length, items: [...Object.entries(stages).map(([k, v]) => `stage ${k}: ${v}`), ...loc.locators.slice(0, 15).map((l) => `${l.project.name} [${l.project.projectId.slice(0, 8)}] · ${l.stage} · next: ${l.nextMove}`)], latestAt: loc.tasksReadAt, detail: `metadata + John's plans + Work Board${loc.tasksReadAt ? "" : " (tasks NOT read)"}; stage unknown means not verified` });
    }
    case "brain-index": {
      const { readBrainIndexWith } = await import("./brain-index.server");
      const { countByCategory, CATEGORY_LABELS } = await import("./brain-index");
      const index = await readBrainIndexWith({ config: req.config, token: req.token, aal: req.aal, rest: req.rest, ...(req.now ? { now: req.now } : {}) });
      const bad = index.sources.filter((s) => s.status !== "read");
      const counts = countByCategory(index.items);
      return result(def, {
        status: index.sources.every((s) => s.status === "failed") ? "failed" : "read",
        count: index.items.length,
        items: (Object.keys(counts) as Array<keyof typeof counts>).map((k) => `${CATEGORY_LABELS[k]}: ${counts[k]}`),
        detail: `metadata index only${bad.length ? `; not read: ${bad.map((s) => `${s.label} (${s.status})`).join(", ")}` : ""}`,
      });
    }
    case "files": {
      const all = req.target.route === "/brain";
      const filter = all ? (req.aal === "aal2" ? "" : "&room=neq.finance") : `&room=eq.${id}`;
      const [files, links] = await Promise.all([
        rows(req, `office_files?select=filename,created_at${filter}&order=created_at.desc&limit=100`),
        rows(req, `office_links?select=title,created_at${filter}&order=created_at.desc&limit=100`),
      ]);
      if (!files || !links) return failed(def);
      const merged = [...files.map((f) => ({ t: text(f["filename"]), at: text(f["created_at"], 40) })), ...links.map((l) => ({ t: text(l["title"]), at: text(l["created_at"], 40) }))]
        .sort((a, b) => b.at.localeCompare(a.at));
      return result(def, { count: merged.length, items: merged.slice(0, MAX_ITEMS).map((m) => m.t), latestAt: merged[0]?.at || null, detail: all ? (req.aal === "aal2" ? "all rooms (Brain shows every saved file)" : "all rooms except Finance (needs two-step verification)") : "" });
    }
    case "reports":
      return fromRows(def, await rows(req, `office_notes?select=id,title,created_at&source=eq.${encodeURIComponent(roomReportSource(req.target.id))}&order=created_at.desc&limit=100`), (r) => text(r["title"]), "created_at");
    case "tasks":
      return fromRows(def, await rows(req, "manager_tasks?select=title,status,project,updated_at&order=updated_at.desc&limit=100"),
        (r) => `${text(r["title"], 100)} — ${text(r["status"], 20) || "unknown"}${req.target.route === "/projects" ? ` (${text(r["project"], 60) || "no project"})` : ""}`, "updated_at");
    case "approvals":
      return fromRows(def, await rows(req, "manager_approvals?select=title,status,created_at&order=created_at.desc&limit=100"), (r) => `${text(r["title"], 100)} — ${text(r["status"], 20) || "unknown"}`, "created_at");
    case "changes":
      return fromRows(def, await rows(req, "manager_changes?select=action,entity,at&entity=neq.manager_conversation&order=at.desc&limit=30"), (r) => `${text(r["action"], 60)} on ${text(r["entity"], 60)}`, "at");
    case "notes":
      return fromRows(def, (await rows(req, "office_notes?select=title,source,provenance,created_at&order=created_at.desc&limit=200"))?.filter((r) => r["provenance"] !== "sample" && !text(r["source"]).startsWith("CanX Brain:")) ?? null, (r) => text(r["title"]), "created_at");
    case "decisions":
      return fromRows(def, (await rows(req, "office_notes?select=title,source,provenance,created_at&kind=eq.decision&order=created_at.desc&limit=200"))?.filter((r) => r["provenance"] !== "sample" && !text(r["source"]).startsWith("CanX Brain:")) ?? null, (r) => text(r["title"]), "created_at");
    case "brain-memory":
      return fromRows(def, await rows(req, "office_notes?select=title,created_at&source=like.CanX%20Brain%3A*&order=created_at.desc&limit=100"), (r) => text(r["title"]), "created_at");
    case "round-tables":
      return fromRows(def, await rows(req, "round_tables?select=key,updated_at&order=updated_at.desc&limit=20"), (r) => text(r["key"], 80), "updated_at");
    case "finance-receipts":
    case "subscriptions":
    case "mail-evidence":
    case "mail-preferences": {
      const doc = await financeDoc(req, cache);
      if (doc === "fail") return failed(def);
      const updated = doc ? text(doc["__updated"], 40) || null : null;
      const arr = (k: string) => (doc && Array.isArray(doc[k]) ? (doc[k] as Row[]) : []);
      if (def.key === "finance-receipts") {
        // Counts only — vendors and amounts are not part of the snapshot.
        const receipts = arr("receipts");
        return result(def, { count: receipts.length, latestAt: updated, detail: "counts only; vendor names and amounts withheld" });
      }
      if (def.key === "subscriptions") {
        const subs = arr("subscriptions");
        return result(def, { count: subs.length, items: subs.slice(0, MAX_ITEMS).map((s) => text(s["name"], 80)).filter(Boolean), latestAt: updated });
      }
      if (def.key === "mail-evidence") {
        const last = doc && doc["subscriptionLastCheck"] && typeof doc["subscriptionLastCheck"] === "object" ? (doc["subscriptionLastCheck"] as Row) : null;
        return result(def, { count: arr("subscriptionEvidence").length, latestAt: last ? text(last["at"], 40) || updated : updated, detail: last ? `last email check ${last["complete"] === true ? "complete" : "partial or not confirmed"}` : "no email check recorded" });
      }
      const prefs = doc && doc["mailPreferences"] && typeof doc["mailPreferences"] === "object" ? (doc["mailPreferences"] as Row) : null;
      const senders = prefs && Array.isArray(prefs["senders"]) ? (prefs["senders"] as Row[]) : [];
      const messages = prefs && Array.isArray(prefs["messages"]) ? (prefs["messages"] as Row[]) : [];
      return result(def, { count: senders.length + messages.length, items: senders.slice(0, MAX_ITEMS).map((s) => `${text(s["action"], 10)} ${text(s["sender"], 120)}`), latestAt: updated, detail: `${senders.length} sender rule(s), ${messages.length} single-email choice(s)` });
    }
    default:
      return failed(def, "no reader exists for this source");
  }
}

export async function readRoomSnapshotWith(req: SnapshotRequest): Promise<RoomSnapshot> {
  const cache: { doc?: Promise<Row | null | "fail"> } = {};
  const sources = await Promise.all(req.target.sources.map((def) => readSource(req, def, cache).catch(() => failed(def))));
  return assembleSnapshot(req.target, sources, (req.now?.() ?? new Date()).toISOString(), req.buildId ?? "unknown");
}
