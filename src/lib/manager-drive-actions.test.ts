import { describe, expect, it } from "vitest";

import { requestIsDiscussionOnly } from "./builder-choice";
import { classifyManagerRisk } from "./manager-work.functions";

describe("Drive action routing", () => {
  it("treats list/read/create/update as routine green work under existing policies", () => {
    expect(classifyManagerRisk("list_drive_files", "drive")).toBe("green");
    expect(classifyManagerRisk("read_drive_file", "drive")).toBe("green");
    expect(classifyManagerRisk("create_drive_file", "drive")).toBe("green");
    expect(classifyManagerRisk("update_drive_file", "drive")).toBe("green");
  });

  it("keeps destructive actions red; no Drive delete action exists", () => {
    expect(classifyManagerRisk("delete_data", "drive")).toBe("red");
  });

  it("treats examples and negations as discussion-only, never explicit Drive writes", () => {
    expect(requestIsDiscussionOnly("for example, could you create a drive file?")).toBe(true);
    expect(requestIsDiscussionOnly("don't create any drive files yet")).toBe(true);
    expect(requestIsDiscussionOnly("imagine you updated that drive file")).toBe(true);
  });
});
