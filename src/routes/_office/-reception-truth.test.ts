/**
 * Reception truth regression (14 September 2026 repair backlog): the live
 * command-centre view must not show the old synthetic 4 / 2 / 1 / C$300
 * figures or the SAMPLE_STATUS list, and the office ceiling must appear only
 * with truthful scope and provenance.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const reception = readFileSync("src/routes/_office/index.tsx", "utf8");

describe("Reception shows no synthetic status", () => {
  it("does not import or render the sample status list", () => {
    expect(reception).not.toContain("SAMPLE_STATUS");
    expect(reception).not.toContain("StatusPanel");
    expect(reception).not.toContain("SampleBadge");
  });

  it("drops the hard-coded 4 / 2 / 1 / C$300 metrics", () => {
    expect(reception).not.toContain("CAD $300");
    expect(reception).not.toContain("C$300");
    expect(reception).not.toMatch(/Metric\s+label=/);
    expect(reception).not.toContain("synthetic examples");
  });

  it("says plainly that no counter is connected instead of guessing", () => {
    expect(reception).toContain("No counter is connected to the");
  });
});

describe("Reception states the office ceiling honestly", () => {
  it("shows John's C$500 CAD ceiling with provenance and no enforcement claim", () => {
    expect(reception).toContain("C$500 per month (CAD)");
    expect(reception).toContain("Provenance:");
    expect(reception).toContain("not automatically enforced");
  });
});
