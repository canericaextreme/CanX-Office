// @vitest-environment node
// docs/office-room-briefs.json is generated from the Office's own code so the (Deno) connector can serve the tour and
// room briefs without importing the whole app. This test fails when the file is out of date.
// Regenerate: CANX_UPDATE_BRIEFS=1 bunx vitest run src/lib/room-briefs-snapshot.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allRoomBriefs, officeTour } from "@/lib/room-brief";
import { CAPTURE_ROOM_LABELS } from "@/lib/room-capture-meta";

const FILE = "docs/office-room-briefs.json";
const build = () => JSON.parse(JSON.stringify({ note: "Generated from src/lib/room-brief.ts. Documented in code, not proof a room works today.", tour: officeTour(), briefs: allRoomBriefs() }));

describe("room brief snapshot", () => {
  it("is up to date", () => {
    if (process.env["CANX_UPDATE_BRIEFS"] === "1") writeFileSync(FILE, JSON.stringify(build(), null, 1) + "\n");
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(build());
  });
  it("covers every capturable room exactly once, with Elsie first and Reception right after", () => {
    const snap = JSON.parse(readFileSync(FILE, "utf8"));
    expect(snap.tour[0]).toMatchObject({ key: "elsie", order: 1 });
    expect(snap.tour[1]).toMatchObject({ route: "/reception" });
    const routes = snap.tour.map((s: { route: string | null }) => s.route).filter(Boolean).sort();
    expect(routes).toEqual(Object.keys(CAPTURE_ROOM_LABELS).sort());
    expect(snap.briefs.map((b: { route: string }) => b.route).sort()).toEqual(routes);
  });
});
