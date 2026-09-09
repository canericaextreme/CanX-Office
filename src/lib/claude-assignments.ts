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
      "Continue feasibility/validation before any build. The concept appears commercially promising, but customer willingness to pay, differentiation, data-source access, and success-fee legal structure require evidence before GO.",
    evidence: [
      "Concept: Canadian public-contract/RFP intelligence service that matches public opportunities to a contractor profile, summarizes mandatory requirements/deadlines, flags gaps, and recommends BID / REVIEW / PASS; later bid-assistance is possible.",
      "Initial segment: small/mid-sized Canadian contractors, initially highway/civil-related, Alberta and BC.",
      "CanadaBuys is already the official federal tender source and emphasizes mandatory criteria, capacity, evaluation criteria and bid/no-bid decisions.",
      "Current competitors validate demand but also increase differentiation risk. CanProcX currently markets Canadian tender discovery, eligibility screening, AI tender matching and AI-assisted bid preparation. TenderPartner markets municipal RFP monitoring/matching plus proposal/compliance support. BidPros markets matched opportunities and a 5% verified-win success-fee model.",
      "Revenue concepts being considered but NOT approved: subscription, paid bid assistance, and potentially a legally compliant success fee/royalty. No percentage is approved.",
      "Build authorized: NO. Investment authorized: $0 beyond explicitly approved research/testing.",
    ]
      .map((line) => `- ${line}`)
      .join("\n"),
    question:
      "Independently challenge this opportunity. Is CONTINUE FEASIBILITY / VALIDATE BEFORE BUILD the right recommendation? Identify the strongest reasons for and against it, major overlooked risks, missing evidence, competitive differentiation needed, concerns with a success-fee model, and the cheapest next test that would materially increase confidence. You are explicitly allowed to disagree. John retains final authority.",
    boundaries: [
      "Feasibility and research only. No build is authorised.",
      "$0 investment authorised beyond research John has explicitly approved.",
      "Claude reviews only. It cannot approve a build, a price, or any spending.",
      "John retains final authority on every decision.",
    ],
  },
];

export function findClaudeAssignment(id: string): ClaudeAssignment | undefined {
  return CLAUDE_ASSIGNMENTS.find((item) => item.id === id);
}
