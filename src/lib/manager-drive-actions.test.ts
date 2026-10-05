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

  it("still treats destructive Drive wording as red when the scope says delete", () => {
    expect(classifyManagerRisk("update_drive_file", "delete drive data")).toBe("red");
  });

  it("does not treat Drive questions or hypotheticals as explicit requests", () => {
    expect(requestIsDiscussionOnly("what drive files can you see?")).toBe(true);
    expect(requestIsDiscussionOnly("if you created a drive file, what would happen?")).toBe(true);
  });
});
