import { expect, it } from "vitest";
import { OFFICE_ROOM_IDENTITIES } from "./office-room-identity";
import { buttonTip, roomTip } from "./hover-guide";

it("every room, and the map, has a plain explanation from the Office tour", () => {
  for (const room of OFFICE_ROOM_IDENTITIES) {
    const tip = roomTip(room.route);
    expect(tip, room.route).not.toBeNull();
    expect(tip!.title).toBe(room.label);
  }
  expect(roomTip("/")!.title).toBe("Office map");
  expect(roomTip("/not-a-room")).toBeNull();
});

it("common buttons have their own words; others need a box to be explained", () => {
  expect(buttonTip("Edit tab, locked")!.what).toMatch(/Edit tab/);
  expect(buttonTip("Edit list of this room's boxes + undo")!.what).toMatch(/every box/);
  expect(buttonTip("Talk to Elsie")!.what).toMatch(/Elsie/);
  expect(buttonTip("Home / Reception")!.what).toMatch(/map/);
  expect(buttonTip("Approve")!.what).toMatch(/yes/);
  expect(buttonTip("Mystery")).toBeNull();
  expect(buttonTip("Mystery", "finance.receipts", "Receipt records")!.why).toContain(
    "Receipt records",
  );
});
