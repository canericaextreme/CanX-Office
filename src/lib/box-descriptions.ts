/**
 * Box labels — what each box in the Office is and what it is for.
 *
 * John, 12 Nov 2026: "each box in every office will show a description and purpose as you hover
 * over each."
 *
 * This is the ONE place these words live. The hover/tap label on every box (RoomLayout.tsx) and
 * Elsie's room guide (room-guide.ts) both read it, so what John sees and what Elsie says never
 * disagree. Keyed by the box id as built ("room-id.part"), so a box John renamed or moved with the
 * Edit tab keeps its label. Text only: no storage, no network, no AI call.
 *
 * Add a line here when you add a new <RoomBox>. A box with no line still gets a plain label from
 * the rules at the bottom (shortcut, saved knowledge, room skills, ...), never nothing.
 */
import { OFFICE_ROOM_IDENTITIES } from "./office-room-identity";

export interface BoxDescription {
  /** What the box is / shows, in one plain sentence. */
  what: string;
  /** What it is for — why John would use it. */
  why: string;
}

const d = (what: string, why: string): BoxDescription => ({ what, why });

/** Every box id that ships today. Never change a key once shipped (saved moves use the id). */
export const BOX_DESCRIPTIONS: Record<string, BoxDescription> = {
  // Reception
  "reception.welcome": d(
    "The front door of the Office, with the Talk to Elsie button and today's pre-trip light.",
    "Start here: tell Elsie what you need, or pick a room to open.",
  ),
  "reception.shortcut-work-board": d(
    "A shortcut that opens the Work Board.",
    "Jump straight to the task list.",
  ),
  "reception.shortcut-brain": d(
    "A shortcut that opens the CanX Brain.",
    "Jump straight to the Office's shared memory.",
  ),
  "reception.shortcut-approvals": d(
    "A shortcut that opens Approvals.",
    "Jump straight to the decisions waiting for you.",
  ),
  "reception.shortcut-office-map": d(
    "A shortcut to the Office map, which shows every room.",
    "Pick any room from the map to open it.",
  ),
  "reception.connect": d(
    "The dated checklist of which assistants (Claude, ChatGPT, Elsie) are connected to the Office, with the evidence for each step.",
    "Shows what is really connected and what the next connection step is, so nothing is assumed.",
  ),

  // Owner's Desk
  "owner-desk.pretrip": d(
    "Elsie's daily pre-trip card: a quick check of the Office each morning, like a truck walk-around.",
    "Tells you at a glance if anything needs fixing before the day's work starts.",
  ),
  "owner-desk.emails": d(
    "Emails the 6 a.m. sweep collected in the last 48 hours, each with Accept or Ignore.",
    "Lets you pick which emails become Office work. Ignore stops that sender in future sweeps; Gmail itself is never changed.",
  ),
  "owner-desk.priorities": d(
    "Your top priorities for today, taken from the Work Board.",
    "Keeps the most important jobs in front of you.",
  ),
  "owner-desk.approvals": d(
    "Requests waiting for your yes or no.",
    "Work that needs your OK stops here until you decide, so nothing goes ahead without you.",
  ),
  "owner-desk.budget": d(
    "How much of this month's AI running-cost ceiling has been used.",
    "Warns you before AI spending gets near the limit you set.",
  ),
  "owner-desk.changes": d(
    "The latest changes made in the Office, newest first.",
    "Lets you see what moved or changed since you last looked.",
  ),
  "owner-desk.connection": d(
    "Whether the Office is connected and signed in right now.",
    "If something shows red here, other boxes may not load their saved information.",
  ),

  // Approvals
  "approvals.banner": d(
    "The header for the one inbox where every decision that needs you lands.",
    "One place for all yes/no decisions, instead of hunting through rooms.",
  ),
  "approvals.requests": d(
    "Every approval request with its reason, risks and the proposed action.",
    "Read a request, then approve or decline it. Nothing waiting here goes ahead without you.",
  ),
  "approvals.send": d(
    "A form to send something new for approval.",
    "Use it when a piece of work should wait for an owner decision before it starts.",
  ),
  "approvals.second-eyes": d(
    "Claude's independent second-eyes review of a request.",
    "A second opinion that is allowed to disagree, so a decision is not made on one view alone.",
  ),
  "approvals.files": d(
    "Files saved to support approval requests.",
    "Keeps the evidence for a decision next to the decision.",
  ),
  "approvals.how": d(
    "The steps an approval goes through, from request to decision.",
    "Explains what happens after you press approve or decline.",
  ),

  // Office Team
  "office-team.members": d(
    "The people and AI roles that work in the Office, and who does what.",
    "Shows who is responsible for each kind of work.",
  ),
  "office-team.helpers": d(
    "AI helpers that are planned but not connected yet.",
    "Keeps planned helpers separate from ones that really work today.",
  ),

  // Records
  "records.classes": d(
    "The kinds of records the Office keeps (for example decisions, sources and files).",
    "Helps file each record in the right place so it can be found later.",
  ),
  "records.export": d(
    "A button to export a sample record pack. It is switched off for now.",
    "Planned way to hand a bundle of records to someone else.",
  ),

  // Blueprint
  "blueprint.main": d(
    "The Office's design plan: each room's job, how the rooms connect, and the decisions behind the design.",
    "The reference to check before changing how the Office is built.",
  ),

  // Systems
  "systems.banner": d(
    "The header for the room that tracks every service and account the Office depends on.",
    "Starting point for checking connections.",
  ),
  "systems.connected": d(
    "What the Office is connected to right now, with evidence.",
    "Shows which services really work, so you don't rely on one that isn't connected.",
  ),
  "systems.group-a": d(
    "Accounts that have been checked and confirmed through ChatGPT.",
    "A list of connections that are proven, not just planned.",
  ),
  "systems.group-b": d(
    "Connections the Office still needs.",
    "A to-do list of services to connect next.",
  ),
  "systems.security": d(
    "The security checklist for the Office.",
    "Makes sure sign-in, secrets and backups are looked after.",
  ),
  "systems.claude-review": d(
    "Claude's independent review panel. Claude never speaks as the Office Manager here.",
    "Gets a second opinion that may disagree with Elsie when the evidence says so.",
  ),
  "systems.budget": d(
    "The monthly AI running-cost ceiling and how much has been used.",
    "Keeps AI spending inside the limit you set.",
  ),
  "systems.chatgpt": d(
    "The state of the ChatGPT and Elsie connection.",
    "Shows whether ChatGPT and Elsie can reach the Office right now.",
  ),
  "systems.next-check": d(
    "When the next connection check is due.",
    "A reminder so connections are re-checked before they quietly expire.",
  ),
  "systems.diagnosis": d(
    "A helper that explains a connection error in plain words.",
    "Paste an error to find out what went wrong and what to try next.",
  ),

  // Health
  "health.energy": d(
    "A private place for you to note how you feel, sleep, stress and capacity. Nothing is saved here yet.",
    "Helps you notice when you are running low, before it shows in the work.",
  ),
  "health.capacity": d(
    "A planned capacity signal. It is a future feature and not working yet.",
    "Will warn you before big decisions are scheduled on a low-capacity day.",
  ),

  // Communications
  "communications.mailbox": d(
    "Whether Elsie can read your Gmail (read-only), with the button to connect it.",
    "Lets Elsie fetch receipts when you ask. Your inbox is not copied into the Office.",
  ),
  "communications.scheduled": d(
    "Messages planned to go out later.",
    "Lets you see and plan outgoing messages before they are sent.",
  ),

  // Legal / Subscriptions / Projects
  "legal.main": d(
    "Legal matters: contracts, obligations, privacy, ownership and compliance, with their records.",
    "Keeps legal questions in one place and flags when a professional should review them.",
  ),
  "subscriptions.manager": d(
    "Every paid service and AI provider the Office uses, with costs and renewal dates.",
    "Helps you manage spending and cancel or renew on time. Changes to paid plans always need your OK.",
  ),
  "project-rooms.register": d(
    "The list of projects the Office is working toward, with goals and progress.",
    "Shows every project in one place, so none is forgotten.",
  ),

  // Finance
  "finance.categories": d(
    "Buttons for the Finance sections: income, expenses, tax and receipts.",
    "Jump straight to the part of Finance you need.",
  ),
  "finance.budget": d(
    "The monthly AI running-cost ceiling and how much has been used.",
    "Keeps AI spending inside the limit you set.",
  ),
  "finance.income": d("Records of money coming in.", "Tracks income toward your monthly goal."),
  "finance.expenses": d("Records of money going out.", "Shows where the money is spent."),
  "finance.expenses-budget": d(
    "The AI running-cost ceiling, shown again beside expenses.",
    "Compare AI spending with your other expenses.",
  ),
  "finance.tax": d(
    "Records kept ready for tax time.",
    "Makes tax preparation easier by keeping the papers together.",
  ),
  "finance.receipt-inbox": d(
    "Where receipts are imported and exported.",
    "Bring new receipts into Finance, or take a copy out.",
  ),
  "finance.totals": d(
    "Receipt totals added up by currency.",
    "A quick view of how much was spent in each currency.",
  ),
  "finance.receipts": d(
    "Every saved receipt, like a bank statement.",
    "Check each receipt and find one fast.",
  ),
  "finance.reconciliation": d(
    "Matching receipts against bank records.",
    "Makes sure every charge has a receipt and nothing is counted twice.",
  ),

  // Work Board
  "work-board.tasks": d(
    "The master list of every task, with owner, priority, status and what a waiting task needs.",
    "See what is planned, being worked on, waiting or done, and who has it.",
  ),
  "work-board.add": d(
    "A form to add a new task.",
    "Put new work on the board so it gets an owner and a priority.",
  ),

  // Build & Testing
  "build-testing.codex": d(
    "The Codex (ChatGPT) builder: starts and tracks code builds for the Office.",
    "Turns an approved job into a code change for review. Paid builds need your OK.",
  ),
  "build-testing.claude": d(
    "The Claude builder: starts and tracks code builds for the Office.",
    "A second builder for approved jobs. Paid builds need your OK.",
  ),
  "build-testing.connections": d(
    "Which assistants are signed in to the Office.",
    "Shows if Claude, ChatGPT or Elsie needs to sign in again.",
  ),
  "build-testing.view-access": d(
    "The view-only passes for assistants, with on/off switches and expiry dates.",
    "Lets assistants look at rooms without changing anything. Only you can turn a pass on or renew it.",
  ),
  "build-testing.health": d(
    "The after-update room check: was every room opened on the newest build?",
    "Proves an update really works, instead of just assuming it does.",
  ),
  "build-testing.room-check": d(
    "Owner check of which rooms Elsie can connect to.",
    "Finds rooms Elsie cannot read before you rely on her there.",
  ),
  "build-testing.examples": d(
    "Example plans for builds. These are not live build results.",
    "Shows how a build brief is laid out.",
  ),

  // Idea Garage
  "idea-garage.rules": d(
    "The recorded rules for how ideas are handled here.",
    "So every idea is judged the same fair way.",
  ),
  "idea-garage.avenues": d(
    "Kinds of income open to brainstorming.",
    "Points idea hunting toward ways to make money.",
  ),
  "idea-garage.lab": d(
    "The Idea Lab: scores ideas using dated evidence. No AI runs on this screen.",
    "Compare ideas on facts before choosing one to test.",
  ),
  "idea-garage.stage-bike-rack": d(
    "Raw ideas, with no filtering yet.",
    "A parking spot so no idea gets lost.",
  ),
  "idea-garage.stage-bulletin-board": d(
    "Ideas that have some evidence behind them.",
    "The contenders worth a closer look.",
  ),
  "idea-garage.stage-decision-table": d(
    "Ideas scored against the agreed criteria.",
    "Where ideas are compared side by side.",
  ),
  "idea-garage.stage-approved-experiment": d(
    "Ideas you chose to test.",
    "Only you choose which experiment goes ahead.",
  ),
  "idea-garage.stage-park-reject": d(
    "Ideas closed or parked, with the reason written down.",
    "So the same idea isn't argued again without new facts.",
  ),
  "idea-garage.income": d(
    "Your monthly income goal and how ideas relate to it.",
    "Keeps ideas pointed at the goal that matters.",
  ),

  // Safe Highways
  "safe-highways.banner": d(
    "The header for Safe Highways programme and routing oversight.",
    "Starting point for the Safe Highways project.",
  ),
  "safe-highways.progress": d(
    "How far each part of Safe Highways has got, with evidence.",
    "Shows real progress, not guesses.",
  ),
  "safe-highways.components": d(
    "The parts of Safe Highways: public reporting app, website, Foreman Dashboard, Ops Center and Master Oversight.",
    "Shows how the parts fit together and the state of each.",
  ),
  "safe-highways.routing": d(
    "Evidence about how reports are routed to the right crew.",
    "Proves routing works before anyone relies on it.",
  ),

  // Future
  "future.reserved": d(
    "Space kept free for future Office rooms and long-term plans.",
    "Somewhere to grow the Office later.",
  ),

  // Brain
  "brain.hub": d(
    "The Brain's filing shelves, one for each kind of saved record.",
    "The Office's shared memory: where notes, handovers and files are kept so no thread forgets.",
  ),
  "brain.live": d(
    "A live view of what is in the Brain right now.",
    "Check that saved notes are really there.",
  ),
  "brain.documents": d(
    "Project documents saved in the Brain.",
    "Keeps the original papers for each project.",
  ),
  "brain.memory": d(
    "Saved conversation memory from Elsie and the other assistants.",
    "Lets the assistants remember past talks.",
  ),
  "brain.map": d(
    "A list of how saved records connect to each other.",
    "Follow a topic from one record to the next.",
  ),
  "brain.growth": d(
    "How the Brain has grown over time.",
    "Shows the Office is learning and saving its work.",
  ),

  // Skills
  "skills.registry": d(
    "Which version of the Office Skills registry is shown.",
    "Confirms you are looking at the latest rules.",
  ),
  "skills.search": d("A search box for Office skills.", "Find a skill by name fast."),
  "skills.group-core": d(
    "The core skills, listed in the order they were built.",
    "The basic instructions every room relies on.",
  ),
  "skills.group-outline": d(
    "Room instructions installed across the whole Office.",
    "Rules each room follows.",
  ),
  "skills.group-draft": d(
    "Instructions written for particular rooms.",
    "What each room is set up to do.",
  ),
  "skills.group-reserved": d(
    "Skill names kept for later.",
    "Placeholders so planned skills have a home.",
  ),
  "skills.group-legacy": d(
    "Old skill entries, kept for history only.",
    "A record of what changed; they are not used any more.",
  ),
  "skills.loop": d(
    "The steps Elsie follows, in order, when she reviews work.",
    "So reviews happen the same careful way every time.",
  ),
  "skills.gaps": d(
    "Instructions that are still missing an approved definition.",
    "A list of skills to write next.",
  ),
  "skills.coverage": d(
    "Which of the 19 numbered rooms have skills installed.",
    "Spots rooms that are missing instructions.",
  ),

  // Round Table
  "round-table.header": d(
    "The header for the Round Table meeting room.",
    "Where priorities and decisions are reviewed together.",
  ),
  "round-table.toolbar": d(
    "Buttons to save, reload, export and import the meeting.",
    "Keep a copy of the meeting or bring one in.",
  ),
  "round-table.readiness": d(
    "What needs to be ready before the next meeting.",
    "So the meeting starts prepared.",
  ),
  "round-table.meeting": d("The meeting's date, time and who is chairing.", "Sets up the meeting."),
  "round-table.agenda": d("The list of topics to cover.", "Keeps the meeting on track."),
  "round-table.seats": d(
    "Who has a seat at the table. Planned seats are not connected participants.",
    "Shows who takes part.",
  ),
  "round-table.notes": d("Notes taken during the meeting.", "Remembers what was said."),
  "round-table.decisions": d("The log of decisions made.", "A record of what was decided and why."),
  "round-table.actions": d(
    "Follow-up jobs, each with an owner and a due date.",
    "Makes sure decisions turn into work.",
  ),

  // Analytics
  "analytics.board": d(
    "Ten measurement cards: Office health, money, AI usage, builders, projects, time, bottlenecks, top actions and security.",
    "Shows how the Office is doing using saved records only; anything not connected says so.",
  ),
  "analytics.office-hours": d(
    "Hours worked in the Office, by period.",
    "Tracks time spent. No hours are made up.",
  ),
  "analytics.safe-highways": d(
    "Safe Highways progress, shown in the Analytics room.",
    "Follow the main project from the measures room.",
  ),
  "analytics.brain-activity": d(
    "Charts of work by stage, changes per day and where work is stalled.",
    "Spot stuck work quickly.",
  ),

  // Family Continuity
  "family-continuity.office-skills": d(
    "How many Office skills are installed, with a link to the Skills room.",
    "Teaches the family what the Office can do.",
  ),
};

/* ------------------------------------------------------------------ */
/* Rules for boxes that are made from lists (one box per item)           */
/* ------------------------------------------------------------------ */

const roomOfId = (id: string) => OFFICE_ROOM_IDENTITIES.find((r) => r.id === id.split(".")[0]);
const slugOf = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * The label for one box. Uses the written line when there is one; otherwise a plain rule for
 * boxes built from lists; otherwise the room's own purpose. Never returns nothing.
 */
export function boxDescription(id: string, name = ""): BoxDescription {
  const exact = BOX_DESCRIPTIONS[id];
  if (exact) return exact;
  const room = roomOfId(id);
  const roomLabel = room?.label ?? "this room";
  const part = id.slice(id.indexOf(".") + 1);
  const shown = name.trim();

  if (part.startsWith("shortcut-")) {
    const target =
      OFFICE_ROOM_IDENTITIES.find((r) => slugOf(r.label) === slugOf(shown)) ??
      OFFICE_ROOM_IDENTITIES.find((r) => slugOf(r.shortLabel) === slugOf(shown));
    if (!target && /map/i.test(shown))
      return d(
        "A shortcut to the Office map, which shows every room.",
        "Pick any room from the map to open it.",
      );
    return d(
      `A shortcut that opens ${target?.label ?? shown ?? "a room"}.`,
      target?.purpose ?? "Go straight to that room.",
    );
  }
  if (part.startsWith("knowledge-"))
    return d(
      `A saved knowledge record${shown ? `: ${shown}` : ""}.`,
      "Written rules and background the Office works from. Open it to read each section.",
    );
  if (part.startsWith("queued-"))
    return d("An item queued for this round table.", "So it is discussed at the next meeting.");
  if (part.startsWith("review-"))
    return d(
      "A second-eyes review prepared for the meeting.",
      "So the table hears an independent view before deciding.",
    );
  if (part === "files")
    return d(
      `Files and links saved to ${roomLabel}.`,
      "Keeps this room's papers in one place. The newest show first.",
    );
  if (part === "skills")
    return d(
      `The skills (instructions) this room follows, with a link to the Skills room.`,
      "Shows what this room is set up to do and what is still missing.",
    );
  if (part === "setup")
    return d(
      `How far ${roomLabel} has been set up.`,
      "Says plainly what works today and what is not connected yet.",
    );
  return d(
    shown ? `${shown}, part of ${roomLabel}.` : `Part of ${roomLabel}.`,
    room?.purpose ?? "Part of the Office.",
  );
}

/** One plain line for Elsie: "what. For: why." */
export function boxDescriptionLine(id: string, name = ""): string {
  const b = boxDescription(id, name);
  return `${b.what} For: ${b.why}`;
}
