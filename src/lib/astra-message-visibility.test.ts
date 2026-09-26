import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Astra conversation visibility", () => {
  const source = readFileSync("src/components/office/OfficeManager.tsx", "utf8");

  it("scrolls to the latest message instead of the controls below the transcript", () => {
    expect(source).toContain('querySelectorAll<HTMLElement>("[data-astra-message]")');
    expect(source).toContain("data-astra-message={message.role}");
    expect(source).not.toContain("pane.scrollTop = pane.scrollHeight");
  });
});
