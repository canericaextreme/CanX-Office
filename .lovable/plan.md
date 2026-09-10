# Manager-run office: inventory first, then fill only the gaps

You talk only to the Manager. The Manager turns approved decisions into tasks, assigns workers, verifies results, and keeps one master task list. Nothing existing is deleted or rebuilt.

## Step 1 — Inventory (already done, no changes made)

What is already there:

- Office Manager chat, owner sign-in with two-step verification, and fail-closed rules so nothing runs without a verified owner.
- Manager can currently do only two things: preview a look change, and propose a task for you to save.
- Tasks and decisions exist, but they live only in this browser (`office-notes`), not in the CanX database, so they do not survive a new device or a cleared browser.
- An activity log exists, but only records real Claude review runs, and also only in this browser.
- A spending ceiling of C$500/month is written down for the whole office, display only, not enforced.
- Spending controls exist as unapplied database rules (`0002_ai_limits.sql`) that would enforce per-minute, per-day and per-month limits.
- Claude second-eyes review exists as a separate screen you press yourself.
- Receipt work, Brain, rooms, Finance and the 20 destinations exist and stay untouched.

What is missing:

- A single master task list that survives restarts and lives in the CanX database.
- Workers, assignment, and Manager-verified results.
- The green / yellow / red decision rule and an approval box.
- A C$100/month AI budget with a warning at 75 and a pause at 100.
- Manager permission to call Claude for second eyes on its own.
- A change log with rollback points.

## Step 2 — Build only the gaps

1. **Master task list (survives restarts).** New owner-only tables in the existing CanX database for tasks, assignments, results, decisions and the change log. Every record keeps who created it, when, and what evidence backs the result. Existing browser-stored tasks are imported once on your say-so, never overwritten or deleted.

2. **Manager memory across restarts.** The Manager reads the master list, open approvals, recent changes and the current budget position at the start of every conversation, so it does not forget between sessions.

3. **Green / yellow / red.** Every action the Manager plans is labelled before it runs:
   - Green: routine, reversible, inside budget. The Manager proceeds and logs it. Small calls never stop work.
   - Yellow: money, outside contact, irreversible changes, or anything that crosses a project boundary. Goes to your approval box and waits.
   - Red: blocked by a rule (no verified sign-in, over budget, safety-critical, or explicitly forbidden). That one operation stops with a plain reason; everything else keeps going.

   Safe Highways and Trail Tales are handled like any other project: routine data changes are green, major changes are yellow, and anything that would alter their production deployment or safety-critical rules is red.
   Publishing, payments, subscriptions, and sending emails stay yellow or red regardless of budget. Reading, sorting and drafting emails are green.

4. **Approval box.** One place in the office listing everything waiting on you, with what it will do, why, cost if any, and Approve / Decline. Nothing yellow runs until you press Approve.

5. **AI budget C$100 per month.** Enforced in the database, not just written down: a warning banner at C$75 used, and a hard pause at C$100 where the Manager refuses further paid calls and tells you plainly. Every paid call is recorded with its cost estimate. The existing C$500 office-wide ceiling stays as the separate whole-office record.

6. **Second eyes without asking.** Inside the C$100 budget, the Manager may send its own work to Claude for review as a green action, and shows the review in the task record. Outside budget it becomes red.

7. **Verify before rebuild.** When something looks wrong, the Manager first checks the actual current state and reports what it found. Rebuilding or replacing working parts is always yellow, never automatic.

8. **Change log and rollback points.** Every Manager-made change is logged with a before/after note and a named restore point, and you can restore from that list. Approved recovery baselines stay protected.

## Technical notes

- New migration `docs/migrations/0005_manager_workbench.sql`: `manager_tasks`, `manager_assignments`, `manager_approvals`, `manager_changes` (append-only), plus grants and owner + AAL2 RLS matching the existing pattern. Additive only; no existing table is altered destructively.
- Reuse `reserve_ai_call` / `settle_ai_call` from `0002_ai_limits.sql` for budget enforcement, with `max_cents_per_month = 10000`; add a warn threshold read at 75%.
- Server functions in `src/lib/manager-work.functions.ts`; Manager tool allowlist extended with narrow, validated task/assign/verify/log tools. No general write powers, no raw evidence in prompts.
- Risk classification lives server-side and cannot be talked into changing by chat text.
- UI: approval box and master list added as panels in existing rooms (Work Board / Owner Desk / Approvals). No visual redesign, no change to rooms, Brain, Finance or the 20 destinations.
- Tests for: risk classification, budget warn/pause, restart memory reload, approval gating, rollback point creation, and fail-closed behaviour with no verified owner.
- Migrations 0004 and 0005 are supplied but not applied by me, and nothing is published or deployed.

## Blockers you will need to clear

- Migrations `0004` and `0005` must be applied to the CanX database before the master list persists.
- Paid second-eyes calls need the Anthropic settings already configured plus a verified owner session.

