/**
 * How a captured room is handed to an assistant over the Office connector.
 *
 * A picture only counts as delivered when it travels as an image content block
 * the assistant's client can show to its model. A link or a text description is
 * not enough. Whether each client really passes that block to its model has to
 * be tested per assistant; this file only builds the message.
 */

import { DENIAL_MESSAGES, type AccessDenial } from "@/lib/assistant-access";
import { captureFreshness, validateCaptureMeta, type RoomCaptureMeta } from "@/lib/room-capture";

export type ToolContent =
  | { type: "image"; data: string; mimeType: "image/png" }
  | { type: "text"; text: string };

export interface ToolResult {
  content: ToolContent[];
  isError: boolean;
}

/** Larger than this and clients tend to drop the block; ask for a smaller capture instead. */
export const MAX_IMAGE_BASE64_CHARS = 4_000_000;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function captureToolResult(metaInput: unknown, pngBase64: string, now: number = Date.now()): ToolResult {
  const check = validateCaptureMeta(metaInput);
  if (!check.ok) return refusal(check.reason);
  if (!pngBase64 || !BASE64.test(pngBase64)) return refusal("Image data is not valid.");
  if (pngBase64.length > MAX_IMAGE_BASE64_CHARS) return refusal("Image is too large to send. Capture a smaller view.");
  const meta: RoomCaptureMeta = check.meta;
  const freshness = captureFreshness(meta, now);
  const text = JSON.stringify({
    room: meta.room,
    route: meta.route,
    capturedAt: meta.capturedAt,
    viewport: meta.viewport,
    buildVersion: meta.buildVersion,
    state: meta.state,
    pageHeight: meta.pageHeight,
    imageSha256: meta.imageSha256,
    freshness,
    note:
      freshness === "fresh"
        ? "A still picture of the room, not live navigation."
        : "This picture is not fresh. Do not describe it as the room's current state.",
  });
  return { content: [{ type: "image", data: pngBase64, mimeType: "image/png" }, { type: "text", text }], isError: false };
}

export function denialToolResult(reason: AccessDenial): ToolResult {
  return refusal(DENIAL_MESSAGES[reason]);
}

function refusal(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
