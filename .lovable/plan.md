# CanX Office — Phase 0: Inventory and Blueprint (Revised)

Read-only planning only. Nothing is built, deployed, connected, or changed in any live system by this document. Phase 1 does not begin without your explicit approval.

## Change list (this revision)

1. The realistic branded 3D office, interactive brain demonstration, and guided tour are restored as required parts of Phase 1 acceptance, not deferred.
2. The backend provider decision is reopened: Lovable Cloud and a CanX-controlled Supabase option are compared, with a recommendation and unknowns. Neither is enabled or connected.
3. Navigation count corrected to 20 destinations; all 20 preserved; Idea Garage / Income & Decision Room stays one destination.
4. Cost wording corrected: no fixed build cost is promised; Lovable credit usage during development is acknowledged and must be tracked.
5. Acceptance matrix reordered so safeguards are tested before the capabilities they protect, with repeat checks when later phases add capability.
6. Inventory conclusion limited to what was actually inspected; no claims made about Safe Highways, Trail Tales, or any other account.

## 1. What was inspected, and what it showed

Inspected: this CanX starter project's own source files only.

- One blank home screen (placeholder graphic), one shared page frame, default starter styling.
- No CanX branding, no rooms, no logo asset, no 3D, no stored data, no logins, no connected accounts, no AI workers, no Safe Highways link.
- Reusable toolkit present: page navigation, a large ready-made interface component set (cards, tables, dialogs, tabs, forms, charts), data fetching, form validation, notifications, icons.
- No backend is connected to this project.

Conclusion, limited to that scope: this CanX starter contains no existing application functionality to migrate or preserve. Safe Highways, Trail Tales, mailboxes, payment, hosting, and every other account were not inspected, are outside this scope, and must remain untouched. No claim is made about their state or safety.

## 2. Navigation map — 20 destinations, all required in Version 1

1. Reception / Office Manager
2. Owner's Desk
3. Goal & Analytics (CanX Brain)
4. Idea Garage / Income & Decision Room (one destination)
5. Project Rooms
6. Safe Highways Room
7. Work Board
8. Office Team
9. Build & Testing
10. Finance Office
11. Subscription Watch
12. Communications
13. Legal & Compliance
14. Records & Rules
15. Skills / SOP Library
16. Systems & Connections
17. Office Health / Backup & Recovery
18. Approvals
19. Office Blueprint
20. Future Department (empty, labelled, no pretend staff or spend)

Every destination opens either a real screen or an honest "not connected — here is what setup requires" panel with no external side effects. Project workspaces at Phase 1: Safe Highways and Trail Tales as placeholders with clearly labelled example data only, kept separate from each other. Further projects come from a reusable template.

## 3. Status language

Green = verified within a stated scope; Blue = actively moving; Yellow = decision or information needed; Red = stop or failure; Grey = planned, disconnected, unknown, or stale, each labelled separately. Colour never carries meaning alone; every state shows supporting text. Brand red is visually distinct from alert red. Worker and project category colours use a separate labelled legend.

## 4. Phase 1 scope and visual requirement

Phase 1 delivers the branded realistic office as the navigation and experience layer, plus the fast simple work screens behind it.

- Realistic office view: depth, lighting, recognizable rooms, workstations, doors, restrained motion, CanX identity at reception, black/charcoal surfaces with controlled red accents. Text placeholder logo until the approved asset is supplied.
- Clicking a room opens a fast, clean work screen immediately. No avatar walking is ever required to complete a task.
- Interactive brain demonstration in Goal & Analytics, with category view and status view, each with its own legend, search, zoom, filters, breadcrumbs, reset, and an equivalent accessible list.
- Guided tour, clearly labelled as a tour and visually distinct from real job activity.
- Persistent room navigation, search, Back, Home/Owner's Desk, and a Simple view toggle.
- Build order may put the simple work screens first, but Phase 1 is not accepted until the office view, brain demonstration, and tour are all present and working.
- Every function remains fully usable in simple view, on a phone, with keyboard navigation, reduced motion, and when 3D fails or the device is slow. Work screens load before heavy visual assets. No autoplay sound. View preference is remembered.
- All figures and activity in Phase 1 are labelled sample data with no external effects.

## 5. Backend decision — open, not chosen

Saved records, owner login with mandatory MFA, access rules, history, and backups require a suitable backend. No provider is approved. Two candidates:

**Lovable Cloud** — fastest to set up inside this environment, managed database, logins, storage, server functions, and secrets. Built on Supabase technology, so schema and data are exportable. Trade-off: the account relationship sits with Lovable; rebuilding elsewhere depends on the export and migration path being exercised and proven.

**CanX-controlled Supabase project** — the account, billing, and data belong directly to CanX. Strongest ownership, portability, and independent rebuild story; access rules, MFA, backups, point-in-time restore, and exports are configured and owned by you. Trade-off: you manage setup, credentials, upgrades, and cost directly, and the connection to this project must be authorized separately.

Comparison points still unknown and needing evidence before the decision: actual monthly cost at expected volume for each; MFA enforcement details and recovery controls available on the intended plan; backup frequency, retention, and restore-test procedure; export completeness including files and history; and a rehearsed rebuild-outside-Lovable run.

Recommendation, subject to your approval and the unknowns above: a CanX-controlled Supabase project, because ownership, portability, and independent rebuild are stated non-negotiables. Nothing is enabled or connected under this document.

## 6. Cost assumptions

Planning guardrail CAD $300/month, editable, unverified. Phase 1 requires no new services or subscriptions under this proposal, but development consumes Lovable credits, and actual usage must be tracked. No fixed build cost is claimed. Backend costs from Phase 2 and AI usage costs from Phase 3 are unknown until accounts and volumes are confirmed; they will be displayed as "unknown", never as zero.

## 7. Open unknowns

1. Owner-approved CanX logo file — not supplied; text placeholder until then.
2. Backend provider decision and account ownership (Section 5).
3. Safe Highways real project, deployment, and database identities — not inspected, no access.
4. Trail Tales app details — placeholder only, no connection.
5. Receipt mailbox identities (Canerica14, Canerica Extreme) — unresolved, no access assumed.
6. AI provider API availability and account permissions (ChatGPT as manager, Claude as reviewer) — unconfirmed.
7. Stripe account — unverified, no live payments.
8. Income goal definition (revenue, profit, or personal income), currency, and baseline — until confirmed, show "Baseline needed", no percentage.
9. Verified subscription costs and hard spending caps.
10. Recovery objectives: acceptable data loss and downtime.
11. Trusted alert channel for security incidents, separate from the connections it protects.

Performance targets for a named device and network are moved into Phase 1 acceptance so the 3D office and simple view can be checked on your desktop and phone before Phase 2.

## 8. Acceptance matrix — safeguards precede the capability they protect

| Requirement | Tested in phase | Passing result | Evidence |
|---|---|---|---|
| Owner orientation | 1 | Current work, a blocker, an approval, a cost, and evidence are findable without technical explanation | Walkthrough |
| All 20 destinations navigable | 1 | Every destination opens; Home/Back/search work; no dead ends | Screens |
| Realistic office, brain, guided tour | 1 | Office view, both brain legends, and a labelled tour all work; rooms open fast work screens | Screens |
| Simple view, phone, keyboard, reduced motion, 3D failure | 1 | Every function completable without 3D | Screens |
| Demo integrity | 1 | Every sample figure and animation labelled; no external side effects | Review |
| Persistence | 2 | Reload and a new authorized session retain records and history | Test log |
| Owner MFA and recovery | 2 | Owner access and sensitive actions enforce MFA; recovery and factor changes audited, no bypass, stale sensitive approvals invalidated | Test log |
| Access control | 2 | Cross-project read and write blocked server-side, including direct API calls | Test log |
| Evidence integrity | 2 | Missing or stale checks never display as current green verification | Test log |
| Phase 2 approvals are records only | 2 | No approval record in Phase 2 can trigger any external execution path | Test log |
| Backup, restore, portability | 2 | Documented restore recovers sample records and files; independent rebuild verified from source, schema, and export | Restore record |
| Connection anomaly: detection, suspension, trusted notification | 3, before the first connection is operational | Simulated credible anomaly suspends the connection and dependent jobs, records evidence, alerts through a trusted separate channel, requires authorized recovery, and does not execute stale approvals | Incident record |
| Malicious-input protection | 3, before workers process any external material | Imported instructions cannot widen permissions, disclose secrets, or approve actions | Test log |
| AI usage tracking and enforced spend limits | 3, before any paid worker execution | Jobs pause at enforced caps; unknown cost is visible; costs roll into Subscription Watch and project totals once, with retries, adjustments, and currency handled explicitly; no automatic purchasing | Job logs |
| Independent review | 3 | Author cannot self-approve independent review; missing reviewer stays pending | Test log |
| Worker interruption | 3 | Restart, timeout, cancellation, and retry retain task state with no duplicate external action | Job logs |
| Safe Highways read-only boundary | 3 | Office actions cannot mutate its production systems; existing gates preserved | Test log |
| Approval integrity, expiry, concurrent sessions, duplicate prevention | 4, gating all execution | Replayed, expired, altered, or unauthorized approvals fail server-side; expiry returns the task to review and surfaces at next login; racing sessions produce one outcome and at most one execution | Test log |
| Finance execution gate | 4 | Duplicate receipts and webhooks do not duplicate ledger effects; fees and currency stay distinct | Test log |
| Communications execution gate | 4 | Draft, queued, attempted, delivered, and acknowledged cannot be confused | Test log |
| Deployment execution gate | 4 | Each deployment action individually approved; rollback documented | Test log |
| Regression on expansion | 5 and any later capability addition | Anomaly, malicious-input, spend-limit, and approval-integrity tests re-run and pass whenever a new capability or connection is added | Test logs |

Each phase ends with a plain-English walkthrough, evidence, limitations, updated costs, rollback and recovery notes, and your acceptance decision.

## 9. Unresolved decisions that genuinely block Phase 1

Only one:

1. **Phase 1 authorization itself.** The text-logo placeholder is already allowed by the master prompt, so no separate logo decision blocks Phase 1. Everything else — backend provider, mailboxes, AI providers, Stripe, income baseline, spending caps, recovery objectives — is needed for Phase 2 or later.

Approving this blueprint authorizes Phase 1 only: the branded office shell with all 20 destinations and labelled sample data. It authorizes no connection, purchase, or production change.
