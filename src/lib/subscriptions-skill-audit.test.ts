import { describe, expect, it } from "vitest";
import { assembleSnapshot, roomTargetForRoute, type SourceResult } from "./room-snapshot";
import { buildSubscriptionsSkillAudit, installedSubscriptionAuditSkills, parseSubscriptionsSkillAuditCommand } from "./subscriptions-skill-audit";
import type { SubscriptionRecord } from "./subscriptions";

const source = (key: string, status: SourceResult["status"] = "read"): SourceResult => ({ key, label: key, kind: "live", status, count: status === "read" ? 1 : null, items: [], latestAt: status === "read" ? "2026-10-04T01:00:00Z" : null, detail: status === "read" ? "read" : "failed safely" });
const snapshot = (route: "/subscriptions" | "/finance", failedKey = "") => {
  const target = roomTargetForRoute(route);
  if (!target) throw new Error("Fixture route missing");
  const sources = target.sources.map((definition) => source(definition.key, definition.key === failedKey ? "failed" : "read"));
  return assembleSnapshot(target, sources, "2026-10-04T01:18:00Z", "build-1");
};
const subscriptions: SubscriptionRecord[] = [{ id: "s1", name: "Lovable", aliases: [], senderDomains: [], scope: "office", cadence: "monthly", knownCost: { amount: 24, currency: "USD", asOf: "2026-10-01", source: "John" }, nextRenewal: null, history: [], notes: "", updatedAt: "" }];

describe("explicit Subscriptions room skill audit", () => {
  it("supports John's exact command but not questions, negations or hypotheticals", () => {
    expect(parseSubscriptionsSkillAuditCommand("Elsie, follow all the skills in the Subscriptions room and let me know which ones you can't fulfill.")).toBe("run");
    expect(parseSubscriptionsSkillAuditCommand("Have you followed all the skills in the Subscriptions room?")).toBe("status");
    expect(parseSubscriptionsSkillAuditCommand("Do not run all skills in the Subscriptions room")).toBeNull();
    expect(parseSubscriptionsSkillAuditCommand("Could you run all skills in the Subscriptions room?")).toBeNull();
  });

  it("enumerates every installed relevant procedure beyond the normal three-skill bound", () => {
    const skills = installedSubscriptionAuditSkills();
    expect(skills).toHaveLength(8);
    const report = buildSubscriptionsSkillAudit({ subscriptions, evidence: [], subscriptionsSnapshot: snapshot("/subscriptions"), financeSnapshot: snapshot("/finance"), checkedAt: "2026-10-04T01:18:00Z" });
    expect(report.items).toHaveLength(8);
    expect(new Set(report.items.map((item) => item.id))).toEqual(new Set(skills.map((skill) => skill.id)));
    expect(report.completed).toBeGreaterThan(0);
    expect(report.blocked).toBeGreaterThan(0);
    expect(report.items.every((item) => item.liveTested === false)).toBe(true);
  });

  it("fails individual procedures closed when a required read fails", () => {
    const report = buildSubscriptionsSkillAudit({ subscriptions, evidence: [], subscriptionsSnapshot: snapshot("/subscriptions", "mail-evidence"), financeSnapshot: snapshot("/finance"), checkedAt: "2026-10-04T01:18:00Z" });
    expect(report.items.find((item) => item.id === "subscriptions.renewal-check")).toMatchObject({ status: "blocked", result: "No renewal result was claimed." });
    expect(report.items.find((item) => item.id === "subscriptions.plan-change-review")?.status).toBe("blocked");
    expect(report.items.some((item) => item.status === "completed" && item.id.includes("renewal"))).toBe(false);
  });

  it("never reports unavailable usage, dependency, ledger or exact receipt work as completed", () => {
    const report = buildSubscriptionsSkillAudit({ subscriptions, evidence: [], subscriptionsSnapshot: snapshot("/subscriptions"), financeSnapshot: snapshot("/finance"), checkedAt: "2026-10-04T01:18:00Z" });
    for (const id of ["subscriptions.tool-value-review", "subscriptions.vendor-dependency-check", "finance.budget-variance-review", "finance.receipt-reconciliation"]) {
      expect(report.items.find((item) => item.id === id)?.status, id).toBe("blocked");
    }
  });
});