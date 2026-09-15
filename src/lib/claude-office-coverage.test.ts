import { describe, expect, it } from "vitest";

import { parseReview, REVIEW_AREAS } from "./claude-review.functions";

function payload(areaFindings: unknown) {
  return JSON.stringify({
    recommendation: "agree",
    confidence: "medium",
    strongestReasons: ["one"],
    risks: [],
    missingEvidence: [],
    nextStep: "next",
    areaFindings,
  });
}

const complete = REVIEW_AREAS.map((area) => ({ area, finding: `Finding for ${area}.` }));

describe("parseReview whole-office coverage", () => {
  it("accepts a complete six-area whole-office review", () => {
    const review = parseReview(payload(complete), "office");
    expect(review?.areaFindings).toHaveLength(REVIEW_AREAS.length);
  });

  it("rejects a whole-office review that is missing an area", () => {
    expect(parseReview(payload(complete.slice(0, 5)), "office")).toBeNull();
  });

  it("rejects duplicate areas", () => {
    const first = complete[0]!;
    expect(parseReview(payload([...complete.slice(0, 5), { ...first }]), "office")).toBeNull();
  });

  it("rejects extra or invalid area names", () => {
    expect(parseReview(payload([...complete, { area: "Snacks", finding: "n/a" }]), "office")).toBeNull();
    expect(
      parseReview(payload([...complete.slice(0, 5), { area: "Snacks", finding: "n/a" }]), "office"),
    ).toBeNull();
  });

  it("rejects an area with an empty finding", () => {
    const partial = complete.map((item, index) => (index === 2 ? { area: item.area, finding: "" } : item));
    expect(parseReview(payload(partial), "office")).toBeNull();
  });

  it("stays compatible with manual scope by default", () => {
    expect(parseReview(payload([]))).not.toBeNull();
    expect(parseReview(payload([]), "manual")).not.toBeNull();
  });
});
