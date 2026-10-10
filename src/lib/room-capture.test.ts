import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OFFICE_ROOM_IDENTITIES } from "@/lib/office-room-identity";
import {
  CAPTURE_MASK_CSS,
  CAPTURE_MAX_AGE_MS,
  CAPTURE_VIEWPORTS,
  allOfficeRoutes,
  captureFreshness,
  captureMatchesBuild,
  captureTier,
  isCapturableRoute,
  officeRoomCatalogue,
  twoStepRoutes,
  validateCaptureMeta,
} from "@/lib/room-capture";
import { EXIT_NOT_THE_ROOM, EXIT_REFUSED, ROOM_LABELS, TWO_STEP_ROUTES, checkTarget, classifyCapture } from "../../scripts/capture/capture-room.mjs";

const SCRIPT = readFileSync("scripts/capture/capture-room.mjs", "utf8");

const good = () => ({
  room: "Goal & Analytics / CanX Brain",
  route: "/brain",
  capturedAt: "2026-10-10T16:30:00.000Z",
  viewport: { name: "desktop", width: 1440, height: 900 },
  buildVersion: "index-AbC123.js",
  state: "default",
  pageHeight: 2400,
  imageSha256: "a".repeat(64),
});

describe("room list covers the whole Office", () => {
  it("matches the real room pages, so a new room cannot be silently missed", () => {
    const pages = readdirSync("src/routes/_office")
      .filter((file) => file.endsWith(".tsx") && !file.startsWith("-") && file !== "index.tsx")
      .map((file) => "/" + file.replace(".tsx", ""))
      .sort();
    expect([...allOfficeRoutes()].sort()).toEqual(pages);
    expect(pages.length).toBe(24);
  });

  it("uses the Office's own room identities", () => {
    expect(officeRoomCatalogue().map((r) => r.route)).toEqual(OFFICE_ROOM_IDENTITIES.map((r) => r.route));
  });
});

describe("room tiers", () => {
  it("treats Brain as standard and Legal as a two-step room", () => {
    expect(captureTier("/brain")).toBe("standard");
    expect(captureTier("/legal")).toBe("two_step");
    expect(captureTier("/nope")).toBeNull();
    expect(captureTier(undefined)).toBeNull();
  });

  it("opens two-step rooms only inside the owner's window", () => {
    expect(isCapturableRoute("/brain")).toBe(true);
    for (const route of twoStepRoutes()) {
      expect(isCapturableRoute(route)).toBe(false);
      expect(isCapturableRoute(route, { twoStepWindowOpen: true })).toBe(true);
    }
    expect(isCapturableRoute("/nope", { twoStepWindowOpen: true })).toBe(false);
  });

  it("derives two-step rooms from the Office's own data sources", () => {
    expect([...twoStepRoutes()].sort()).toEqual(["/communications", "/finance", "/legal", "/projects", "/subscriptions"]);
  });
});

describe("capture script stays in step with the rules", () => {
  it("has the same rooms, labels, two-step list, mask and sizes", () => {
    expect(Object.keys(ROOM_LABELS).sort()).toEqual([...allOfficeRoutes()].sort());
    for (const room of officeRoomCatalogue()) expect(ROOM_LABELS[room.route]).toBe(room.label);
    expect([...TWO_STEP_ROUTES].sort()).toEqual([...twoStepRoutes()].sort());
    expect(SCRIPT).toContain(JSON.stringify(CAPTURE_MASK_CSS));
    for (const [name, size] of Object.entries(CAPTURE_VIEWPORTS)) {
      expect(SCRIPT).toContain(`${name}: { width: ${size.width}, height: ${size.height} }`);
    }
  });

  it("refuses bad targets before opening a browser", () => {
    expect(checkTarget("http://localhost:8765", "/brain")).toBeNull();
    expect(checkTarget("https://canx-office.lovable.app", "/brain")).toBeNull();
    expect(checkTarget("http://example.com", "/brain")).toMatch(/https/);
    expect(checkTarget("https://user:pw@example.com", "/brain")).toMatch(/credentials/);
    expect(checkTarget("https://example.com/?token=x", "/brain")).toMatch(/query/);
    expect(checkTarget("https://example.com", "/nope")).toMatch(/not an Office room/);
    expect(checkTarget("https://example.com", "/legal")).toMatch(/two-step/);
    expect(EXIT_REFUSED).toBe(2);
    expect(EXIT_NOT_THE_ROOM).toBe(3);
  });

  it("classifies what the browser really loaded", () => {
    const ok = { route: "/brain", finalPath: "/brain", httpStatus: 200, hasOfficeView: true, hasSignIn: false, textLength: 500 };
    expect(classifyCapture(ok)).toBe("ok");
    expect(classifyCapture({ ...ok, httpStatus: 404 })).toBe("unavailable");
    expect(classifyCapture({ ...ok, httpStatus: NaN })).toBe("unavailable");
    expect(classifyCapture({ ...ok, finalPath: "/reception" })).toBe("wrong_route");
    expect(classifyCapture({ ...ok, hasSignIn: true, hasOfficeView: false })).toBe("sign_in_page");
    expect(classifyCapture({ ...ok, hasOfficeView: false })).toBe("not_a_room");
    expect(classifyCapture({ ...ok, textLength: 3 })).toBe("blank");
    // A missing page is reported before anything the page says about itself.
    expect(classifyCapture({ ...ok, httpStatus: 500, hasSignIn: true })).toBe("unavailable");
  });
});

describe("capture record", () => {
  it("accepts a complete record, including for a two-step room", () => {
    expect(validateCaptureMeta(good()).ok).toBe(true);
    expect(validateCaptureMeta({ ...good(), route: "/legal", room: "Legal" }).ok).toBe(true);
  });

  it("refuses unknown rooms and mismatched names", () => {
    expect(validateCaptureMeta({ ...good(), route: "/nope" }).ok).toBe(false);
    expect(validateCaptureMeta({ ...good(), room: "Legal" }).ok).toBe(false);
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
