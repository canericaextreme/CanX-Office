import { createServerFn } from "@tanstack/react-start";
import { roomTargetForRoute, type RoomSnapshot } from "./room-snapshot";

export type RoomSnapshotReply =
  | { ok: true; snapshot: RoomSnapshot }
  | { ok: false; code: "auth" | "unknown_room" | "not_configured"; message: string };

/**
 * Fresh, read-only snapshot of one room for the signed-in owner. No AI call,
 * no spend, no writes. Finance-doc sources additionally need two-step.
 */
export const getRoomSnapshot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = (input ?? {}) as { accessToken?: unknown; route?: unknown; buildId?: unknown; device?: unknown };
    return {
      accessToken: typeof raw.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "",
      route: typeof raw.route === "string" ? raw.route.slice(0, 200) : "",
      buildId: typeof raw.buildId === "string" ? raw.buildId.slice(0, 80) : "unknown",
      device: raw.device,
    };
  })
  .handler(async ({ data }): Promise<RoomSnapshotReply> => {
    const target = roomTargetForRoute(data.route);
    if (!target) return { ok: false, code: "unknown_room", message: "This page is not an office room." };
    const backend = await import("./canx-backend.server");
    const config = backend.readBackendConfig();
    if (!config) return { ok: false, code: "not_configured", message: backend.DENY_MESSAGES.backend_not_configured };
    const verified = await (await import("./canx-viewer.server")).verifySignedInOrViewerRead(data.accessToken);
    if (!verified.ok) return { ok: false, code: "auth", message: verified.message };
    const { readRoomSnapshotWith } = await import("./room-snapshot.server");
    const { sanitizeDeviceSnapshot } = await import("./room-device-snapshot");
    const snapshot = await readRoomSnapshotWith({ config, token: data.accessToken, aal: verified.aal, target, buildId: data.buildId, device: sanitizeDeviceSnapshot(data.device), rest: backend.restRequest });
    return { ok: true, snapshot };
  });

/** Owner check only: is this exact temporary room report present? Read-only, two-step required. */
export const checkRoomReportPresence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = (input ?? {}) as { accessToken?: unknown; route?: unknown; id?: unknown };
    return {
      accessToken: typeof raw.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "",
      route: typeof raw.route === "string" ? raw.route.slice(0, 200) : "",
      id: typeof raw.id === "string" && /^[0-9a-f-]{36}$/i.test(raw.id) ? raw.id : "",
    };
  })
  .handler(async ({ data }): Promise<{ presence: "present" | "absent" | "failed" }> => {
    const target = roomTargetForRoute(data.route);
    if (!target || !data.id) return { presence: "failed" };
    const backend = await import("./canx-backend.server");
    const config = backend.readBackendConfig();
    if (!config) return { presence: "failed" };
    const verified = await (await import("./canx-viewer.server")).verifySignedInOrViewerRead(data.accessToken);
    if (!verified.ok || (verified.aal !== "aal2" && verified.aal !== "viewer")) return { presence: "failed" };
    const { readRoomReportPresenceWith } = await import("./room-snapshot.server");
    return { presence: await readRoomReportPresenceWith({ config, token: data.accessToken, rest: backend.restRequest, roomId: target.id, id: data.id }) };
  });
