# CanX Office — Phase 0: Inventory and Blueprint Freeze

Read-only planning only. Nothing is built, deployed, connected, or changed in any live system by this document.

## 1. What exists today (verified by inspection)

This project is an empty starter. Verified in the code:

- One blank home screen (placeholder graphic), one shared page frame, default starter styling.
- No CanX branding, no rooms, no logo asset, no 3D, no data storage, no logins, no connected accounts, no AI workers, no Safe Highways link.
- Toolkit present and reusable: page navigation, a large ready-made interface component set (cards, tables, dialogs, tabs, forms, charts), data-fetching, form validation, notifications, icons.
- No backend is connected. Adding logins, saved records, or approvals will require enabling the built-in cloud backend in a later phase.

Conclusion: there is nothing to preserve or migrate. Phase 1 starts from a clean base, which removes the risk of damaging existing work.

## 2. Room map for Version 1 navigation

All 19 destinations must exist in Phase 1 navigation, each with a real screen or an honest "not connected — here is what setup needs" panel:

Reception / Office Manager, Owner's Desk, Goal & Analytics (CanX Brain), Idea Garage / Income & Decision Room (one room), Project Rooms, Safe Highways Room, Work Board, Office Team, Build & Testing, Finance Office, Subscription Watch, Communications, Legal & Compliance, Records & Rules, Skills / SOP Library, Systems & Connections, Office Health / Backup & Recovery, Approvals, Office Blueprint, Future Department (empty, labelled).

Project workspaces at Phase 1: Safe Highways and Trail Tales, both as placeholders with clearly labelled example data only. New projects come from a reusable template, not hand-built pages.

## 3. Status language (single source of meaning)

Green = verified in a stated scope; Blue = actively moving; Yellow = needs a decision or information; Red = stop or failure; Grey = planned, disconnected, unknown, or stale (each labelled separately). Every colour carries supporting text. Brand red is visually distinct from alert red. Worker and project category colours live in a separate legend.

## 4. Proposed stack and reuse plan

- Keep the current framework and interface toolkit; no new front-end framework.
- Phase 1: no backend, no logins, no external calls. All examples are labelled sample data held in the app.
- Phase 2: enable the built-in cloud backend for owner login with mandatory two-step verification, saved records, history, access rules, exports, and backup/restore evidence.
- Phase 3+: one connection at a time, each individually authorized.
- 3D office: deferred as a later visual layer loaded after the working screens. Phase 1 ships the complete simple view first so the office is fully usable without 3D.

## 5. Cost assumptions (unverified)

Planning guardrail CAD $300/month, editable. Phase 1 adds no new spend. Phase 2 backend costs and Phase 3 AI usage costs are unknown until accounts are confirmed; they will be shown as "unknown", never as zero.

## 6. Open unknowns (must be answered before the phase that needs them)

1. Owner-approved CanX logo file — not supplied. Text placeholder until then.
2. Real Safe Highways project, deployment, and database identities — not inspected, no access from here.
3. Trail Tales app details — placeholder only, no connection.
4. Receipt mailbox identities (Canerica14, Canerica Extreme) — unresolved, no access assumed.
5. AI provider API availability and permissions (ChatGPT as manager, Claude as reviewer) — unconfirmed.
6. Stripe account — not verified, no live payments.
7. Income goal definition (revenue, profit, or personal income) and currency, plus baseline — until confirmed, show "Baseline needed", no percentage.
8. Current verified subscription costs and hard caps.
9. Recovery objectives (how much data loss and downtime is acceptable).
10. Performance targets for a named device and network.

## 7. Acceptance matrix (requirement to phase to test)

| Requirement | Phase | Test | Evidence |
|---|---|---|---|
| Owner orientation | 1 | Find current work, a blocker, an approval, a cost, evidence | Walkthrough |
| All rooms navigable | 1 | Every room opens; Home/Back/search; no dead ends | Screens |
| Simple view, phone, keyboard, reduced motion | 1 | Complete tasks without 3D | Screens |
| Brain accuracy and two legends | 1 | Nodes open the right record; modes differ | Screens |
| Demo integrity | 1 | Every sample figure labelled; no external effect | Review |
| Persistence | 2 | Reload and new session retain records | Test log |
| Access control | 2 | Cross-project read/write blocked at the server | Test log |
| Owner MFA and recovery | 2 | Sensitive actions require fresh verification; recovery audited | Test log |
| Evidence integrity | 2 | Stale or missing checks never show green | Test log |
| Recovery and portability | 2 | Documented restore; independent rebuild path | Restore record |
| Independent review | 3 | Author cannot self-approve review | Test log |
| Worker interruption and cost rollup | 3 | No duplicate actions; costs counted once | Job logs |
| Safe Highways read-only | 3 | No production mutation possible | Test log |
| Approval integrity, expiry, concurrent sessions | 4 | Replayed/expired/altered approvals fail server-side | Test log |
| Connection anomaly | 4 | Suspends connection and jobs, alerts, needs authorized recovery | Incident record |
| Spend limits, finance, communications, injection | 4 | Each gated separately | Test logs |

## 8. Phase boundaries

Phase 0 (this document) inventory and freeze. Phase 1 branded office shell, all rooms, brain demonstration, Owner's Desk, Work Board, approval screen, guided tour, labelled sample data only, no external effects. Phase 2 login, saved records, history, access rules, backup. Phase 3 one read-only connection plus first manager/worker/reviewer loop. Phase 4 individually approved actions. Phase 5 expansion.

Each phase ends with a plain-English walkthrough, evidence, limitations, costs, rollback notes, and your acceptance decision.

## 9. Decision required from you

Approve this Phase 0 inventory and blueprint to unlock Phase 1 (office shell with labelled sample data only), or tell me what to change first. Approving does not authorize any connection, purchase, or production change.
