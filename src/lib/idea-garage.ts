// Idea Garage — durable repository data for idea cards.
// Provenance: "john" = real user-requested idea (not demonstration data).
// These are NOT approved projects and NOT verified business cases.

export type IdeaProvenance = "john" | "sample";

export interface IdeaCard {
  id: string;
  title: string;
  status: string;
  captured: string; // ISO date
  requestedBy: string;
  provenance: IdeaProvenance;
  workingSummary: string;
  summaryNote?: string;
  toExplore: { label: string; value: string }[];
  notAssessed: string[];
  nextStep: string;
  stage: string; // must match a STAGES name in the route
}

export const IDEA_PROVENANCE_LABELS: Record<IdeaProvenance, string> = {
  john: "John-requested idea",
  sample: "Demonstration data",
};

export const IDEA_CARDS: IdeaCard[] = [
  {
    id: "contract-rfp-scanner",
    title: "Contract & RFP Scanner",
    status: "Parked idea — explore later",
    captured: "2026-09-09",
    requestedBy: "John",
    provenance: "john",
    workingSummary:
      "Explore a service that scans public contract opportunities and requests for proposals (RFPs), then helps users identify relevant opportunities.",
    summaryNote:
      "Working summary — exact wording and commercial details from the original discussion were not recovered.",
    toExplore: [
      { label: "Customer group", value: "To explore" },
      { label: "Source websites", value: "To explore" },
      { label: "Useful filters / deadline summaries", value: "To explore" },
      { label: "Possible subscription income", value: "To explore" },
    ],
    notAssessed: ["Pricing", "Demand", "Scope", "Feasibility"],
    nextStep: "Define the intended customer and test a small sample of public opportunities.",
    stage: "Bike rack",
  },
];

export function ideasForStage(stage: string): IdeaCard[] {
  return IDEA_CARDS.filter((c) => c.stage === stage);
}
