import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/office/OfficeManager.tsx", "utf8");

describe("Astra panel layout", () => {
  it("opens full-window with room for Lovable's right-edge chat drawer", () => {
    expect(source).toContain("const [fullScreen, setFullScreen] = useState(true)");
    expect(source).toContain("right: 56");
  });

  it("keeps the writing box large enough to read and edit", () => {
    expect(source).toContain("min-h-[120px] max-h-[50dvh]");
  });
});
