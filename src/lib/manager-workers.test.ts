import { describe, expect, it } from "vitest";
import { validateConsultRequest } from "./manager-workers";

describe("worker consultation room names", () => {
  it.each(["systems", "Systems & Connections", "  SYSTEMS & CONNECTIONS  "])("routes the official systems name %s", room => {
    const result = validateConsultRequest({ workerId: "w-quality-security", room, question: "Check dispatch evidence" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.seat.roomId).toBe("systems");
  });
  it("accepts the Work Board display label for Operations", () => {
    expect(validateConsultRequest({ workerId: "w-operations", room: "Work Board", question: "Check task status" }).ok).toBe(true);
  });
  it.each(["Finance", "Work Board", "Systems & Connections extra", "unknown"])("still refuses a wrong or unknown room %s", room => {
    expect(validateConsultRequest({ workerId: "w-quality-security", room, question: "Check dispatch evidence" }).ok).toBe(false);
  });
  it("still refuses unknown workers and empty questions", () => {
    expect(validateConsultRequest({ workerId: "unknown", room: "systems", question: "Check" }).ok).toBe(false);
    expect(validateConsultRequest({ workerId: "w-quality-security", room: "systems", question: "" }).ok).toBe(false);
  });
});
