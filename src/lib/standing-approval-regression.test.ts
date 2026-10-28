import { describe, expect, it } from "vitest";
import { classifyManagerRisk } from "./manager-work.functions";

// Regression specification for standing owner authorization.
// These tests document existing behavior and the boundaries that the
// implementation must preserve when routine operations are streamlined.
describe("standing approval risk boundaries", () => {
  it("allows ordinary internal repairs and coordination", () => {
    expect(classifyManagerRisk("fix_minor_ui_bug", "office")).toBe("green");
    expect(classifyManagerRisk("run_tests", "office")).toBe("green");
    expect(classifyManagerRisk("file_receipt", "office")).toBe("green");
  });
  it("does not mistake advisory planning for the protected action itself", () => {
    expect(classifyManagerRisk("review_publish_plan", "office")).toBe("green");
    expect(classifyManagerRisk("audit_purchase_proposal", "office")).toBe("green");
    expect(classifyManagerRisk("draft_delete_data_policy", "office")).toBe("green");
  });
  it("retains owner review for spending, publishing and destructive actions", () => {
    expect(classifyManagerRisk("purchase", "office")).toBe("red");
    expect(classifyManagerRisk("publish", "production")).toBe("red");
    expect(classifyManagerRisk("delete_data", "office")).toBe("red");
  });
  it("retains escalation for major structural changes", () => {
    expect(classifyManagerRisk("major_change", "office")).toBe("yellow");
    expect(classifyManagerRisk("schema_change", "office")).toBe("yellow");
  });
});
