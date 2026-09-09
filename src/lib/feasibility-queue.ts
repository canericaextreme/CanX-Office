// Feasibility items queued for a round table.
// Durable repository data so the item is present on any device even though
// shared saving is not yet live. These are NOT approved projects, NOT
// authorised builds, and carry no approved spend.

export interface FeasibilityWorkstream {
  id: string;
  name: string;
  question: string;
}

export interface FeasibilityItem {
  id: string;
  title: string;
  stage: string;
  status: string;
  captured: string;
  requestedBy: string;
  decisionAuthority: string;
  buildAuthorised: string;
  investmentAuthorised: string;
  roundTable: string;
  workingConcept: string;
  pricingNote: string;
  workstreams: FeasibilityWorkstream[];
  decisionPackage: string[];
  agendaTitle: string;
  agendaMinutes: number;
  agendaNotes: string;
}

export const FEASIBILITY_ITEMS: FeasibilityItem[] = [
  {
    id: "canx-opportunity-scout",
    title: "CanX Opportunity Scout",
    stage: "FEASIBILITY",
    status: "Research — queued for the Monday round table",
    captured: "2026-09-09",
    requestedBy: "John",
    decisionAuthority: "John",
    buildAuthorised: "No",
    investmentAuthorised: "$0 unless John explicitly approves later",
    roundTable: "Monday 14 September 2026",
    workingConcept:
      "A Canadian public-contract opportunity intelligence service that scans public procurement opportunities and RFPs, matches them to contractor profiles, summarises deadlines and mandatory requirements, provides bid / no-bid intelligence, and may later include bid assistance.",
    pricingNote:
      "A subscription plus a legally compliant success-fee model is to be researched only. All pricing stays unapproved until feasibility and legal review are complete.",
    workstreams: [
      { id: "ws-market", name: "Market / demand", question: "Who needs this, how many, and how badly?" },
      {
        id: "ws-sources",
        name: "Public data sources & collection rights",
        question: "Which sources, and what do their terms actually permit?",
      },
      { id: "ws-competition", name: "Competition", question: "Who already does this, at what price?" },
      { id: "ws-customer", name: "Customer definition", question: "Exactly which contractor, in which trade and region?" },
      { id: "ws-technical", name: "Technical feasibility", question: "Can it be collected, matched and summarised reliably?" },
      {
        id: "ws-legal",
        name: "Legal / procurement & contingency-fee rules",
        question: "Are success fees on public bids permitted, and where?",
      },
      { id: "ws-pricing", name: "Pricing / revenue", question: "What would people pay, and on what basis?" },
      { id: "ws-costs", name: "Costs / break-even", question: "Build cost, monthly running cost, break-even point." },
      {
        id: "ws-sample",
        name: "Live sample — Alberta / BC opportunities",
        question: "A small real sample, gathered by hand, to test the idea.",
      },
    ],
    decisionPackage: [
      "Demand",
      "Competition",
      "Build cost",
      "Monthly operating cost",
      "Revenue potential",
      "Legal risk",
      "Automation potential",
      "Key risks",
      "Evidence and source links",
      "Recommended next step",
    ],
    agendaTitle: "CanX Opportunity Scout — feasibility (GO / HOLD / NO-GO)",
    agendaMinutes: 10,
    agendaNotes: [
      "Feasibility and research only. No build authorised. No spend authorised.",
      "Decision wanted: GO / HOLD / NO-GO, with a recommended next step.",
      "Nothing has been researched yet — every workstream is still open.",
    ].join("\n"),
  },
];
