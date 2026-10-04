import { skillsForRoute, SKILLS_REGISTRY_VERSION, type OfficeSkill } from "./office-skills";
import { priceChangeFlags, renewalWarnings, serviceBillingCounts, weeklyView, type SubscriptionEvidence, type SubscriptionRecord } from "./subscriptions";
import type { RoomSnapshot, SourceResult } from "./room-snapshot";

export type SubscriptionSkillAuditCommand = "run" | "status" | null;
export type SkillAuditStatus = "completed" | "blocked" | "not-attempted";

export interface SubscriptionSkillAuditItem {
  id: string;
  name: string;
  version: string;
  status: SkillAuditStatus;
  result: string;
  reason: string;
  sources: string[];
  checkedAt: string;
  liveTested: boolean;
}

export interface SubscriptionSkillAuditReport {
  registryVersion: string;
  checkedAt: string;
  completed: number;
  blocked: number;
  notAttempted: number;
  items: SubscriptionSkillAuditItem[];
}

const AUDIT_PHRASE = /\b(?:follow|run|check|audit)\b.*\b(?:all|every)\b.*\bskills?\b.*\bsubscriptions?\s+room\b|\bsubscriptions?\s+room\b.*\b(?:all|every)\b.*\bskills?\b/i;

export function parseSubscriptionsSkillAuditCommand(text: string): SubscriptionSkillAuditCommand {
  const compact = text.trim().replace(/\s+/g, " ");
  if (!compact || compact.length > 300 || !AUDIT_PHRASE.test(compact)) return null;
  if (/\b(?:do not|don't|dont|never|not now)\b/i.test(compact) || /\b(?:if|would|could|can)\b.*\b(?:follow|run|check|audit)\b/i.test(compact)) return null;
  if (/\?$/.test(compact) || /\b(?:have|did|has)\b.*\b(?:skills?|audit|check)\b/i.test(compact)) return "status";
  return "run";
}

export function installedSubscriptionAuditSkills(): OfficeSkill[] {
  return skillsForRoute("/subscriptions").filter((skill) => skill.instructionReady && (
    skill.id === "finance.subscription-review" || skill.id.startsWith("finance.") || skill.id.startsWith("subscriptions.")
  ));
}

const source = (snapshot: RoomSnapshot | null, key: string): SourceResult | null => snapshot?.sources.find((item) => item.key === key) ?? null;
const readable = (snapshot: RoomSnapshot | null, key: string) => source(snapshot, key)?.status === "read";
const sourceLine = (snapshot: RoomSnapshot | null, key: string) => {
  const item = source(snapshot, key);
  if (!item) return `${key}: not available`;
  return `${item.label}: ${item.status}${item.latestAt ? `, latest ${item.latestAt}` : ""}`;
};

function item(skill: OfficeSkill, status: SkillAuditStatus, result: string, reason: string, sources: string[], checkedAt: string): SubscriptionSkillAuditItem {
  return { id: skill.id, name: skill.name, version: skill.version, status, result, reason, sources, checkedAt, liveTested: skill.liveTested };
}

/** Runs all eight installed Subscriptions and linked Finance procedures without the normal three-skill prompt cap. */
export function buildSubscriptionsSkillAudit(input: {
  subscriptions: SubscriptionRecord[];
  evidence: SubscriptionEvidence[];
  subscriptionsSnapshot: RoomSnapshot | null;
  financeSnapshot: RoomSnapshot | null;
  checkedAt: string;
}): SubscriptionSkillAuditReport {
  const skills = installedSubscriptionAuditSkills();
  const subsRead = readable(input.subscriptionsSnapshot, "subscriptions");
  const mailRead = readable(input.subscriptionsSnapshot, "mail-evidence");
  const financeRead = readable(input.financeSnapshot, "finance-receipts");
  const subscriptionSources = [sourceLine(input.subscriptionsSnapshot, "subscriptions"), sourceLine(input.subscriptionsSnapshot, "mail-evidence")];
  const financeSources = [...subscriptionSources, sourceLine(input.financeSnapshot, "finance-receipts")];
  const counts = serviceBillingCounts(input.subscriptions, input.evidence);
  const due = weeklyView(input.subscriptions, input.evidence, new Date(input.checkedAt)).comingDue;
  const changes = priceChangeFlags(input.subscriptions, input.evidence);
  const renewals = renewalWarnings(input.subscriptions, input.evidence, new Date(input.checkedAt));
  const results = skills.map((skill) => {
    if (!skill.instructionReady) return item(skill, "not-attempted", "Instruction is not installed.", "The canonical registry does not permit execution.", [], input.checkedAt);
    if (skill.id === "subscriptions.renewal-check" || skill.id === "finance.renewal-watch") {
      if (!subsRead || !mailRead) return item(skill, "blocked", "No renewal result was claimed.", "Saved subscriptions or billing-email evidence could not be read.", subscriptionSources, input.checkedAt);
      return item(skill, "completed", `${renewals.length} renewal(s) within seven days; ${due.length} evidenced deadline(s) within thirty days.`, "Completed from the fresh bounded Subscriptions read; dates remain evidence-based and payment status is not inferred.", subscriptionSources, input.checkedAt);
    }
    if (skill.id === "subscriptions.plan-change-review") {
      if (!subsRead || !mailRead) return item(skill, "blocked", "No plan-change result was claimed.", "Saved subscriptions or billing-email evidence could not be read.", subscriptionSources, input.checkedAt);
      return item(skill, "completed", `${changes.length} email amount(s) differ from owner-confirmed rates; ${counts.unconfirmed} service recurrence state(s) remain unconfirmed.`, "Completed from current saved service terms and email evidence; no confirmed rate was changed.", subscriptionSources, input.checkedAt);
    }
    if (skill.id === "finance.receipt-reconciliation") {
      return item(skill, "blocked", "Exact receipt reconciliation was not attempted.", financeRead && mailRead ? "The current room sources expose receipt aggregates and email evidence summaries, not exact cross-record receipt identities." : "Finance receipts or billing-email evidence could not be read.", financeSources, input.checkedAt);
    }
    if (skill.id === "finance.budget-variance-review") {
      return item(skill, "blocked", "No budget variance was calculated.", financeRead ? "No complete bank/accounting ledger or verified room-level budget ledger is connected." : "Finance receipt totals could not be read, and no complete ledger is connected.", financeSources, input.checkedAt);
    }
    if (skill.id === "subscriptions.tool-value-review") {
      return item(skill, "blocked", `${counts.services} saved service(s) are visible, but value was not scored.`, "No vendor usage telemetry is connected, so cost cannot be compared with actual use.", subscriptionSources, input.checkedAt);
    }
    if (skill.id === "subscriptions.vendor-dependency-check") {
      return item(skill, "blocked", "No vendor dependency was declared verified.", "The Subscriptions snapshot has no verified project-to-vendor dependency or fallback records.", subscriptionSources, input.checkedAt);
    }
    if (skill.id === "finance.subscription-review") {
      if (!subsRead || !mailRead) return item(skill, "blocked", "No room-wide subscription review was claimed.", "Saved subscriptions or billing-email evidence could not be read.", financeSources, input.checkedAt);
      return item(skill, "completed", `${counts.services} service(s): ${counts.recurring} recurring, ${counts.notRecurring} not recurring, ${counts.usageBased} usage-based, ${counts.unconfirmed} unconfirmed; ${changes.length} rate difference(s) need review.`, "Completed for recorded terms and evidence only; usage and cancellation terms remain unavailable.", financeSources, input.checkedAt);
    }
    return item(skill, "not-attempted", "No deterministic runner exists for this installed instruction.", "The instruction is installed, but this audit has no supported internal operation for it.", [], input.checkedAt);
  });
  return {
    registryVersion: SKILLS_REGISTRY_VERSION,
    checkedAt: input.checkedAt,
    completed: results.filter((result) => result.status === "completed").length,
    blocked: results.filter((result) => result.status === "blocked").length,
    notAttempted: results.filter((result) => result.status === "not-attempted").length,
    items: results,
  };
}
