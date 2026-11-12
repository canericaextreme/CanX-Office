import { createServerFn } from "@tanstack/react-start";
import type { LayoutRead, SaveLayoutResult } from "./room-layout.server";

const tok = (v: unknown) =>
  typeof (v as { accessToken?: unknown })?.accessToken === "string"
    ? (v as { accessToken: string }).accessToken.slice(0, 4000)
    : "";

/** Read John's saved room layout. Read-only. Viewers and failed reads get the built layout. */
export const getRoomLayout = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => ({ accessToken: tok(v) }))
  .handler(
    async ({ data }): Promise<{ ok: true; read: LayoutRead } | { ok: false; message: string }> => {
      const b = await import("./canx-backend.server");
      const config = b.readBackendConfig();
      if (!config) return { ok: false, message: b.DENY_MESSAGES.backend_not_configured };
      const who = await b.verifySignedIn(data.accessToken);
      if (!who.ok) return { ok: false, message: who.message };
      const { readRoomLayout } = await import("./room-layout.server");
      const read = await readRoomLayout((path, init) =>
        b.restRequest(config, data.accessToken, path, init),
      );
      return read
        ? { ok: true, read }
        : { ok: false, message: "The saved layout could not be read. Rooms show as built." };
    },
  );

/** Save one layout change (move, rename, reorder, put back). Owner with two-step only. */
export const saveRoomLayout = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    const raw = (v ?? {}) as { what?: unknown; after?: unknown; expectedVersion?: unknown };
    return {
      accessToken: tok(v),
      what: typeof raw.what === "string" ? raw.what.slice(0, 200) : "",
      after:
        raw.after && typeof raw.after === "object" ? (raw.after as Record<string, unknown>) : {},
      expectedVersion:
        typeof raw.expectedVersion === "string" ? raw.expectedVersion.slice(0, 12000) : "",
    };
  })
  .handler(async ({ data }): Promise<SaveLayoutResult> => {
    const b = await import("./canx-backend.server");
    const config = b.readBackendConfig();
    if (!config) return { ok: false, message: b.DENY_MESSAGES.backend_not_configured, read: null };
    const owner = await b.verifyOwner(data.accessToken);
    if (!owner.ok) return { ok: false, message: owner.message, read: null };
    const { saveRoomLayoutWith } = await import("./room-layout.server");
    const rest = (path: string, init?: RequestInit) =>
      b.restRequest(config, data.accessToken, path, init);
    const result = await saveRoomLayoutWith(rest, {
      ownerId: owner.userId,
      what: data.what,
      after: data.after,
      expectedVersion: data.expectedVersion,
    });
    if (result.ok)
      await rest("office_audit", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          owner_id: owner.userId,
          action: "rooms.layout",
          entity: "office_notes",
          entity_id: "office-room-layout",
          detail: { what: data.what.slice(0, 160), boxes: Object.keys(data.after).slice(0, 60) },
        }),
      }).catch(() => null);
    return result;
  });
