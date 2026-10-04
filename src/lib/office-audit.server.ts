/** Server runner for the whole-office audit. Owner/AAL2 verified; read-only. */
import { ROOM_TARGETS, type RoomSnapshot } from "./room-snapshot";
import { buildOfficeAudit, type BuildPipelineState, type OfficeAuditReport } from "./office-audit";

export async function readBuildPipelineState(accessToken: string): Promise<BuildPipelineState> {
  const tokenPresent = Boolean(process.env["CANX_CODEX_GITHUB_TOKEN"]?.trim());
  const enabled = process.env["CANX_CODEX_ENABLED"] === "true";
  if (!tokenPresent || !enabled) return { tokenPresent, enabled, liveCheck: "not-attempted", detail: "" };
  try {
    const { runCodexBuildOperation } = await import("./codex-builds.functions");
    const res = await runCodexBuildOperation(accessToken);
    return { tokenPresent, enabled, liveCheck: res.ok ? "ok" : "failed", detail: res.ok ? "" : res.detail.slice(0, 200) };
  } catch {
    return { tokenPresent, enabled, liveCheck: "failed", detail: "The workflow read did not complete." };
  }
}

export async function runOfficeAudit(accessToken: string, buildId: string): Promise<{ ok: true; report: OfficeAuditReport } | { ok: false; message: string }> {
  const backend = await import("./canx-backend.server");
  const config = backend.readBackendConfig();
  if (!config) return { ok: false, message: backend.DENY_MESSAGES.backend_not_configured };
  const who = await backend.verifyOwner(accessToken);
  if (!who.ok) return { ok: false, message: who.message };
  const { readRoomSnapshotWith } = await import("./room-snapshot.server");
  const snapshots = new Map<string, RoomSnapshot | null>();
  // Bounded: sequential batches of 6 room reads.
  for (let i = 0; i < ROOM_TARGETS.length; i += 6) {
    const batch = ROOM_TARGETS.slice(i, i + 6);
    const res = await Promise.all(batch.map((target) =>
      readRoomSnapshotWith({ config, token: accessToken, aal: who.aal, target, buildId, rest: backend.restRequest }).catch(() => null)));
    batch.forEach((t, j) => snapshots.set(t.route, res[j] ?? null));
  }
  const build = await readBuildPipelineState(accessToken);
  return { ok: true, report: buildOfficeAudit({ snapshots, build, checkedAt: new Date().toISOString() }) };
}
