/** Claude's Room 11 layout, supplied by John on 7 October 2026. */
export const LEGAL_TOPICS = [
  {
    id: "agreements",
    label: "Contracts & Agreements",
    color: "#203a61",
    description: "Every agreement you sign or are asked to sign.",
    examples: [
      "Signed and active",
      "Drafts under review",
      "Renewal and expiry dates",
      "Amendments and side letters",
    ],
  },
  {
    id: "registration",
    label: "Business Registration & Licences",
    color: "#20583f",
    description: "Papers that show the business is in good standing.",
    examples: [
      "Registration records",
      "Licences and permits",
      "Annual filings",
      "Name and address records",
    ],
  },
  {
    id: "ownership",
    label: "Intellectual Property & Ownership",
    color: "#752333",
    description: "Who owns the names, code and content.",
    examples: [
      "Trademarks and brand names",
      "Copyright",
      "Code and data ownership",
      "Licences granted to others",
    ],
  },
  {
    id: "privacy",
    label: "Privacy & Data",
    color: "#226169",
    description: "How personal information is collected and kept.",
    examples: ["Privacy policy", "Consent wording", "Data-handling rules", "Breach response notes"],
  },
  {
    id: "terms",
    label: "Terms & Policies",
    color: "#60446d",
    description: "Public rules for people who use CanX products.",
    examples: [
      "Terms of use",
      "Cookie notices",
      "Acceptable-use rules",
      "Refund and cancellation wording",
    ],
  },
  {
    id: "providers",
    label: "Software & Cloud Terms",
    color: "#505d6c",
    description: "Rules from the services the office runs on.",
    examples: [
      "Provider terms of service",
      "Data export and exit rights",
      "Billing and spending terms",
      "Notices of service changes",
    ],
  },
  {
    id: "government",
    label: "Government & Regulatory",
    color: "#6a5b22",
    description: "Rules set by public bodies.",
    examples: [
      "Ministry and agency requirements",
      "Contract standards",
      "Compliance notices",
      "Public-sector rules",
    ],
  },
  {
    id: "employment",
    label: "Employment & Conflicts",
    color: "#884720",
    description: "Work arrangements that touch CanX.",
    examples: [
      "Employment terms",
      "Conflict-of-interest notes",
      "Confidentiality clauses",
      "Contractor agreements",
    ],
  },
  {
    id: "insurance",
    label: "Insurance & Liability",
    color: "#225f89",
    description: "Cover and responsibility if something goes wrong.",
    examples: [
      "Policies and certificates",
      "Claims",
      "Waivers and releases",
      "Limits of liability",
    ],
  },
  {
    id: "disputes",
    label: "Disputes & Notices",
    color: "#a02e2e",
    description: "Anything with a deadline or an opposing side.",
    examples: [
      "Demand letters",
      "Claims and complaints",
      "Formal notices received",
      "Response deadlines",
    ],
  },
  {
    id: "dates",
    label: "Deadlines & Renewals",
    color: "#735d20",
    description: "Every legal date in one place.",
    examples: ["Expiry and renewal dates", "Filing due dates", "Notice periods", "Reminders"],
  },
  {
    id: "counsel",
    label: "Questions for a Lawyer",
    color: "#39383e",
    description: "Papers that need a qualified professional.",
    examples: [
      "Items the office cannot judge",
      "Escalation memos",
      "Questions to ask",
      "Advice received",
    ],
  },
] as const;
export const LEGAL_STATUSES = [
  "Unsorted",
  "Draft",
  "Under review",
  "Active",
  "Expiring soon",
  "Closed or expired",
] as const;
export type LegalStatus = (typeof LEGAL_STATUSES)[number];
export interface LegalFiling {
  topic: string;
  status: LegalStatus;
  dueDate: string;
  question: string;
}
export const EMPTY_LEGAL_FILING: LegalFiling = {
  topic: "",
  status: "Unsorted",
  dueDate: "",
  question: "",
};
export const LEGAL_SOURCE = "Legal room: document filing";
export const legalNoteId = (id: string) => `legal-${id}`;
export function validateLegalFiling(v: unknown): LegalFiling {
  const r = (v ?? {}) as Record<string, unknown>;
  if (
    typeof r["topic"] !== "string" ||
    (r["topic"] !== "" && !LEGAL_TOPICS.some((t) => t.id === r["topic"])) ||
    !LEGAL_STATUSES.includes(r["status"] as LegalStatus) ||
    typeof r["dueDate"] !== "string" ||
    typeof r["question"] !== "string" ||
    r["question"].length > 1000
  )
    throw new Error("Choose a recognised legal topic, status and date.");
  if (
    r["dueDate"] &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(r["dueDate"]) ||
      !Number.isFinite(Date.parse(r["dueDate"] + "T12:00:00Z")) ||
      new Date(r["dueDate"] + "T12:00:00Z").toISOString().slice(0, 10) !== r["dueDate"])
  )
    throw new Error("Choose a valid calendar date.");
  return {
    topic: r["topic"],
    status: r["status"] as LegalStatus,
    dueDate: r["dueDate"],
    question: r["question"].trim(),
  };
}
export function parseLegalFiling(detail: unknown): LegalFiling | null {
  try {
    return validateLegalFiling(JSON.parse(String(detail)));
  } catch {
    return null;
  }
}
export function legalDateState(date: string, today: string) {
  return !date ? "none" : date < today ? "overdue" : date === today ? "today" : "upcoming";
}
