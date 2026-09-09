// Prepared Claude "second eyes" assignments.
//
// These are review briefs written by John and kept in the repository so they
// are present on any device. Nothing here calls Anthropic. A prepared
// assignment only fills in the review form; John still presses the button
// himself from the Systems panel while signed in with two-step verification.
//
// A prepared assignment is NOT a review, NOT a decision, NOT an approval to
// build, and carries no authorised spend.

export interface ClaudeAssignment {
  id: string;
  /** Short label used in the picker. */
  label: string;
  /** Where this belongs in the office. */
  context: string;
  requestedBy: string;
  preparedOn: string;
  /** Sent to Claude as the review subject. */
  subject: string;
  /** The recommendation Claude is asked to challenge. */
  primaryRecommendation: string;
  /** Evidence and context, sent as untrusted data. */
  evidence: string;
  /** The review question. */
  question: string;
  /** Shown in the office so nobody mistakes this for a decision. */
  boundaries: string[];
}

export const CLAUDE_ASSIGNMENTS: ClaudeAssignment[] = [
  {
    id: "canx-opportunity-scout-feasibility",
    label: "CanX Opportunity Scout — feasibility challenge",
    context: "Round table, Monday 14 September 2026 — decision context for the Opportunity Scout feasibility item.",
    requestedBy: "John",
    preparedOn: "2026-09-09",
    subject: "CanX Opportunity Scout",
    primaryRecommendation:
      "Continue feasibility/validation before any build. The concept appears commercially promising, but a real paid problem, differentiation against free government alerting, data-source access, and success-fee legal structure all require evidence before GO.",
    evidence: [
      "Concept: Canadian public contract/RFP intelligence service that matches opportunities to contractor profiles, ranks fit, summarizes deadlines and mandatory requirements, identifies gaps, and recommends BID / REVIEW / PASS; later bid assistance is possible.",
      "Initial target to test: small/mid-sized Canadian contractors, especially road maintenance, civil, equipment, traffic control, snow and ice, drainage and related services; Alberta and BC first.",
      "Revenue hypotheses: subscriptions, paid bid assistance, possibly a legally compliant success fee/royalty. No pricing is approved.",
      "Key concern: public procurement, lobbying and contingency-fee restrictions, and whether public tender portals already make basic alerts too commoditized.",
      "CanadaBuys is already the official federal tender source and emphasizes mandatory criteria, capacity, evaluation criteria and bid/no-bid decisions.",
      "Competitors validate demand but raise differentiation risk. CanProcX markets Canadian tender discovery, eligibility screening, AI tender matching and AI-assisted bid preparation. TenderPartner markets municipal RFP monitoring/matching plus proposal and compliance support. BidPros markets matched opportunities and a 5% verified-win success-fee model.",
      "Current status: FEASIBILITY. Build authorized: NO. Investment authorized: $0 unless John approves.",
      "The Monday round table should ultimately receive a GO / VALIDATE / HOLD / NO-GO evidence package.",
    ]
      .map((line) => `- ${line}`)
      .join("\n"),
    question: [
      "Independently challenge the primary thesis. Answer each point:",
      "1. Is there enough evidence of a real paid problem?",
      "2. What assumptions are weakest?",
      "3. How serious is existing competition and free government alerting?",
      "4. What is the strongest defensible differentiation?",
      "5. What success-fee, procurement and lobbying legal risks require counsel?",
      "6. What is the cheapest evidence to gather before any MVP?",
      "7. Recommend GO, VALIDATE, HOLD or NO-GO, and state the evidence threshold that would change that recommendation.",
      "Begin nextStep with 'RECOMMENDATION: GO' or VALIDATE, HOLD or NO-GO. You are explicitly allowed to disagree. John retains final authority.",
    ].join("\n"),
    boundaries: [
      "Feasibility and decision work only. No build is authorised.",
      "$0 investment authorised beyond research John has explicitly approved.",
      "Claude reviews only. It cannot approve a build, a price, or any spending.",
      "John retains final authority on every decision.",
    ],
  },
];


export function findClaudeAssignment(id: string): ClaudeAssignment | undefined {
  return CLAUDE_ASSIGNMENTS.find((item) => item.id === id);
}
