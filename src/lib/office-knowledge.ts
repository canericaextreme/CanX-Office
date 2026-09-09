/**
 * CanX Office — durable management knowledge records.
 *
 * These are John's recorded decisions and management rules, stored in the
 * repository so they survive on every device and are available to the Idea
 * Lab, Decision Room and Round Table. They are NOT demonstration data and
 * NOT authorisation to build or spend anything.
 */

export interface KnowledgeSection {
  id: string;
  heading: string;
  points: string[];
}

export interface KnowledgeRecord {
  id: string;
  title: string;
  recordedOn: string;
  source: string;
  version: number;
  standing: string;
  sections: KnowledgeSection[];
}

export const OFFICE_KNOWLEDGE: KnowledgeRecord[] = [
  {
    id: "idea-lab-governance-2026-09-09",
    title: "Idea Lab, Decision Room and Opportunity Scout — management context",
    recordedOn: "2026-09-09",
    source: "John (conversation summary, 9 September 2026)",
    version: 1,
    standing:
      "Standing management logic. John retains final authority. Brainstorming and research never authorise a build or spending.",
    sections: [
      {
        id: "opportunity-scout",
        heading: "1. CanX Opportunity Scout — feasibility only",
        points: [
          "Working concept: a Canadian public-contract/RFP intelligence service — scan public procurement opportunities, match them against a customer's business profile, rank fit, summarise deadlines and mandatory requirements, and flag gaps such as bonding, certifications and site meetings.",
          "Supports BID / REVIEW / PASS decisions. Longer term: compliance matrices, bid checklists, missing-document tracking, bid assistance.",
          "Start narrow. Candidate first customers: small and mid-sized Canadian contractors without dedicated procurement staff — road maintenance, civil construction, equipment, traffic control, snow and ice, vegetation, drainage and related highway services.",
          "Initial research jurisdictions: Alberta and British Columbia.",
          "Revenue concepts to investigate, NOT approved pricing: subscription tiers, paid bid assistance, and possibly a success fee or royalty on secured contracts.",
          "Success fees need legal and procurement review — Canadian lobbying and procurement restrictions can apply. Do not assume 5%; test smaller percentages and tiered, fixed or capped structures, and whether such a fee is legally appropriate for the service actually provided.",
          "Status: FEASIBILITY ONLY. Build authorised: NO. Investment authorised: $0 unless John later approves. Queued for the Monday Round Table.",
          "Decision package wanted: GO / HOLD / NO-GO with evidence on demand, competition, public data sources and collection rights, customer definition, technical feasibility, legal and procurement rules, pricing and revenue, costs and break-even, automation potential, risks, source links, and a live sample of Alberta/BC opportunities.",
        ],
      },
      {
        id: "idea-lab-purpose",
        heading: "2. Idea Lab purpose",
        points: [
          "Broad brainstorming across many revenue avenues, not only apps.",
          "Brainstorming should be cheap or free; building requires John's explicit authorisation.",
          "Industries beyond highways are in scope, while recognising that CanX domain expertise is an advantage where it applies.",
        ],
      },
      {
        id: "three-tracks",
        heading: "3. Idea flow and decision tracks",
        points: [
          "Flow: Bike Rack → research → bulletin-board contenders → Decision Room → approved experiment/project OR park/reject/archive.",
          "FAST REVENUE — low cost, existing capability, credible demand, can be tested by selling quickly.",
          "VALIDATION — promising but willingness to pay uncertain; small MVP or trial with success criteria set before testing.",
          "FEASIBILITY — expensive, legally complex, dependent on outside data, technically uncertain or hard to reverse; research before build.",
          "REJECT / PARK — insufficient opportunity at present.",
          "Every idea needs a revenue hypothesis; not every idea needs a formal trial.",
          "Decision questions: Who pays? What problem are they paying us to solve? How much might they pay? What is the cheapest way to prove they will pay? How quickly can CanX reach the first dollar?",
          "Time to first dollar is a visible decision metric.",
        ],
      },
      {
        id: "scoring",
        heading: "4. Evidence-driven scoring",
        points: [
          "Live Opportunity Score out of 100, supported by evidence rather than AI opinion.",
          "Separate Confidence Score for the strength of the underlying evidence. High score with low confidence triggers more research, never automatic development.",
          "Thresholds: roughly 70–100 active; 55–69 holding; below 55 off the active rack; below 45 archived/rejected unless protected by John.",
          "'Disappear' means archive, never delete. John can mark an idea PROTECTED so it is never removed automatically.",
          "Scores may decay when an idea gains no new supporting evidence, customer interest or improvement. Archived ideas can return as RISING IDEAS when new evidence materially improves the case.",
        ],
      },
      {
        id: "continuous-research",
        heading: "5. Continuous AI opportunity research",
        points: [
          "Research may draw on market and industry trends, news cycles, public procurement activity, competitor launches and pricing, reviews and complaints, search trends, social chatter, community and forum discussion, regulatory changes and technology developments.",
          "Weight evidence by quality. Social chatter is a signal, not proof; government and public data, actual customer behaviour, pricing, purchasing, interviews and demonstrated willingness to pay carry more weight.",
          "Every score change preserves: what changed, why it moved, source links, evidence confidence, date last researched and next review date.",
          "Discovery workflow: repeated problem across independent sources → NEW OPPORTUNITY DETECTED candidate → preliminary Opportunity and Confidence Scores → recommendation on entering the Bike Rack. It must never silently authorise a build.",
        ],
      },
      {
        id: "hygiene",
        heading: "6. Bike Rack capacity and hygiene",
        points: [
          "Keep the visible Bike Rack focused on roughly the strongest 10–20 ideas.",
          "Lower-ranked ideas stay archived and searchable with their history and reasons.",
          "Idea history is never permanently deleted because a score fell.",
        ],
      },
      {
        id: "round-table",
        heading: "7. Round Table governance",
        points: [
          "Promising ideas graduate to the Decision Room / Round Table.",
          "Workers report evidence, results, risks and recommendations — not activity.",
          "The manager consolidates work down to the few decisions needing John's call. John retains final decision and responsibility.",
          "Monday's Opportunity Scout discussion uses the feasibility package and assumes no development approval.",
        ],
      },
      {
        id: "cost-control",
        heading: "8. Cost control",
        points: [
          "Continuous scanning needs a sensible cadence and source prioritisation so AI and API costs cannot grow uncontrolled.",
          "Expensive or high-frequency monitoring requires justification and, where appropriate, John's approval.",
        ],
      },
    ],
  },
];

/** Revenue avenues the Idea Lab is allowed to explore (section 2). */
export const IDEA_CATEGORIES: string[] = [
  "Mobile / web apps",
  "Browser extensions",
  "AI agents",
  "SaaS tools",
  "Data / intelligence services",
  "Monitoring & alert services",
  "Analytics & reports",
  "Automation services",
  "Professional AI services",
  "Digital products",
  "Licensing",
  "White-label software",
  "APIs & data products",
  "Lead generation",
  "Marketplaces",
  "Training",
  "Consulting",
  "Government / enterprise contracts",
  "Content & media",
  "IP licensing",
  "Build-to-sell digital businesses",
];

export const knowledgeById = (id: string): KnowledgeRecord | undefined =>
  OFFICE_KNOWLEDGE.find((k) => k.id === id);
