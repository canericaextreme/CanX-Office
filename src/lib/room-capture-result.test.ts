import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BASE64_CHARS, captureToolResult, denialToolResult } from "@/lib/room-capture-result";

const meta = () => ({
  room: "Goal & Analytics / CanX Brain",
  route: "/brain",
  capturedAt: "2026-10-10T16:30:00.000Z",
  viewport: { name: "desktop", width: 1440, height: 900 },
  buildVersion: "index-AbC123.js",
  state: "default",
  pageHeight: 2400,
  imageSha256: "b".repeat(64),
});
const NOW = Date.parse("2026-10-10T16:31:00.000Z");
const PNG = "iVBORw0KGgo=";

describe("capture tool result", () => {
  it("sends a real image block first, then the record as text", () => {
    const result = captureToolResult(meta(), PNG, NOW);
    expect(result.isError).toBe(false);
    expect(result.content[0]).toEqual({ type: "image", data: PNG, mimeType: "image/png" });
    const text = result.content[1];
    expect(text?.type).toBe("text");
    const record = JSON.parse((text as { text: string }).text);
    expect(record).toMatchObject({ route: "/brain", buildVersion: "index-AbC123.js", freshness: "fresh" });
    expect(record.viewport).toEqual({ name: "desktop", width: 1440, height: 900 });
  });

  it("says plainly when a picture is stale", () => {
    const result = captureToolResult(meta(), PNG, NOW + 60 * 60_000);
    const record = JSON.parse((result.content[1] as { text: string }).text);
    expect(record.freshness).toBe("stale");
    expect(record.note).toMatch(/not fresh/);
  });

  it("refuses an invalid record, bad image data or an oversized image", () => {
    expect(captureToolResult({ ...meta(), route: "/nope" }, PNG, NOW).isError).toBe(true);
    expect(captureToolResult(meta(), "not base64!!", NOW).isError).toBe(true);
    expect(captureToolResult(meta(), "", NOW).isError).toBe(true);
    expect(captureToolResult(meta(), "A".repeat(MAX_IMAGE_BASE64_CHARS + 4), NOW).isError).toBe(true);
  });

  it("returns refusals as text only, with no image", () => {
    const result = denialToolResult("revoked");
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");
  });
});
