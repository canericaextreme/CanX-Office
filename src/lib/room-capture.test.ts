import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROOMS } from "@/lib/office-data";
import {
  CAPTURE_MASK_CSS,
  CAPTURE_MAX_AGE_MS,
  CAPTURE_VIEWPORTS,
  CAPTURE_WITHHELD_ROUTES,
  allOfficeRoutes,
  captureFreshness,
  captureMatchesBuild,
  capturableRoutes,
  isCapturableRoute,
  validateCaptureMeta,
} from "@/lib/room-capture";

const SCRIPT = readFileSync("scripts/capture/capture-room.mjs", "utf8");

const good = () => ({
  room: ROOMS.find((r) => r.route === "/brain")!.label,
  route: "/brain",
  capturedAt: "2026-10-10T16:30:00.000Z",
  viewport: { name: "desktop", width: 1440, height: 900 },
  buildVersion: "index-AbC123.js",
  state: "default",
  pageHeight: 2400,
  imageSha256: "a".repeat(64),
});

describe("room capture rules", () => {
  it("allows Brain and Legal and withholds the private rooms", () => {
    expect(isCapturableRoute("/brain")).toBe(true);
    expect(isCapturableRoute("/legal")).toBe(true);
    for (const route of ["/finance", "/subscriptions", "/communications", "/records"]) {
      expect(isCapturableRoute(route)).toBe(false);
    }
    expect(isCapturableRoute("/not-a-room")).toBe(false);
    expect(isCapturableRoute(undefined)).toBe(false);
  });

  it("only withholds rooms that exist, so a typo cannot silently open one", () => {
    for (const route of CAPTURE_WITHHELD_ROUTES) expect(allOfficeRoutes()).toContain(route);
    expect(capturableRoutes().length).toBe(allOfficeRoutes().length - CAPTURE_WITHHELD_ROUTES.length);
  });

  it("keeps the capture script in step with these rules", () => {
    for (const room of ROOMS) {
      expect(SCRIPT).toContain(JSON.stringify(room.route) + ": " + JSON.stringify(room.label));
    }
    expect(SCRIPT).toContain(JSON.stringify(CAPTURE_MASK_CSS));
    for (const [name, size] of Object.entries(CAPTURE_VIEWPORTS)) {
      expect(SCRIPT).toContain(`${name}: { width: ${size.width}, height: ${size.height} }`);
    }
    expect(SCRIPT).toContain(JSON.stringify([...CAPTURE_WITHHELD_ROUTES]).replace(/","/g, '", "'));
  });
});

describe("capture record", () => {
  it("accepts a complete record", () => {
    const result = validateCaptureMeta(good());
    expect(result.ok).toBe(true);
  });

  it("refuses withheld or unknown rooms", () => {
    expect(validateCaptureMeta({ ...good(), route: "/finance", room: "Finance Office" }).ok).toBe(false);
    expect(validateCaptureMeta({ ...good(), route: "/nope" }).ok).toBe(false);
  });

  it("refuses a room name that does not match its route", () => {
    expect(validateCaptureMeta({ ...good(), room: "Legal & Compliance" }).ok).toBe(false);
  });

  it("refuses missing or invalid time, build, state, size, height and checksum", () => {
    const base = good();
    const bad: Array<Record<string, unknown>> = [
      { ...base, capturedAt: "yesterday-ish" },
      { ...base, buildVersion: "" },
      { ...base, state: "hovering-maybe" },
      { ...base, viewport: { name: "desktop", width: 1000, height: 900 } },
      { ...base, viewport: { name: "tablet", width: 768, height: 1024 } },
      { ...base, pageHeight: 0 },
      { ...base, pageHeight: 999999 },
      { ...base, imageSha256: "xyz" },
    ];
    for (const record of bad) expect(validateCaptureMeta(record).ok).toBe(false);
    expect(validateCaptureMeta(null).ok).toBe(false);
    expect(validateCaptureMeta("text").ok).toBe(false);
  });
});

describe("freshness", () => {
  const meta = { capturedAt: "2026-10-10T16:30:00.000Z" };
  const at = Date.parse(meta.capturedAt);
  it("is fresh inside the window, stale after it, and flags clocks from the future", () => {
    expect(captureFreshness(meta, at + 1000)).toBe("fresh");
    expect(captureFreshness(meta, at + CAPTURE_MAX_AGE_MS + 1)).toBe("stale");
    expect(captureFreshness(meta, at - 5 * 60_000)).toBe("from-the-future");
  });
  it("never matches an unknown build", () => {
    expect(captureMatchesBuild({ buildVersion: "unknown" }, "unknown")).toBe(false);
    expect(captureMatchesBuild({ buildVersion: "index-1.js" }, "index-1.js")).toBe(true);
    expect(captureMatchesBuild({ buildVersion: "index-1.js" }, "index-2.js")).toBe(false);
  });
});
