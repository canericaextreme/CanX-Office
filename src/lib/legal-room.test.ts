import { describe, it, expect } from "vitest";
import {
  LEGAL_TOPICS,
  LEGAL_STATUSES,
  EMPTY_LEGAL_FILING,
  validateLegalFiling,
  parseLegalFiling,
  legalDateState,
  LEGAL_SOURCE,
} from "./legal-room";
import { noteDefaultCategory } from "./brain-index";
describe("Legal document labels", () => {
  it("preserves unclassified papers and the twelve-topic/six-status plan", () => {
    expect(LEGAL_TOPICS).toHaveLength(12);
    expect(LEGAL_STATUSES).toHaveLength(6);
    expect(EMPTY_LEGAL_FILING.status).toBe("Unsorted");
    expect(EMPTY_LEGAL_FILING.topic).toBe("");
  });
  it("rejects malformed dates and unknown categories rather than inventing filing", () => {
    for (const dueDate of ["2026-02-30", "2026-13-01", "tomorrow"])
      expect(() => validateLegalFiling({ ...EMPTY_LEGAL_FILING, dueDate })).toThrow();
    expect(() => validateLegalFiling({ ...EMPTY_LEGAL_FILING, topic: "bank" })).toThrow();
    expect(parseLegalFiling("bad")).toBeNull();
  });
  it("stores leap-day deadlines and identifies overdue and today dates", () => {
    expect(validateLegalFiling({ ...EMPTY_LEGAL_FILING, dueDate: "2028-02-29" }).dueDate).toBe(
      "2028-02-29",
    );
    expect(legalDateState("2026-10-06", "2026-10-07")).toBe("overdue");
    expect(legalDateState("2026-10-07", "2026-10-07")).toBe("today");
  });
  it("does not turn legal filing labels into Brain memories", () =>
    expect(noteDefaultCategory(LEGAL_SOURCE, "decision", "john")).toBeNull());
});
