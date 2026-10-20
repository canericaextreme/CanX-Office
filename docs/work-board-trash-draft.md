# Work Board Trash — local review draft

The Work Board has Work Board / Trash views and a manual **Run sweep now** button. There is no scheduler. The sweep partitions loaded records in browser component state; it does not write, delete or modify saved tasks, assignments, approvals or history. Navigating away or reloading clears the draft Trash view.

Only `done` and `cancelled` tasks qualify after at least seven full days without recorded activity. `open`, `in_progress` and `waiting` never qualify, regardless of age. Waiting reasons, pending linked approvals and unfinished linked assignments block the sweep. Task creation/update, linked assignment dates, linked approval dates and relevant loaded change-log entries are checked. Missing/invalid dates fail closed. New recorded activity or a reopened task returns the item to the board on refresh. The eligibility cutoff is the last manual sweep, so time passing does not archive additional tasks.

## Missing protected work

The current task model has no durable archive field. Shared, persistent Trash needs a separately approved storage change and server-side sweep that checks authoritative current activity and blockers atomically. This draft cannot guarantee completeness or freshness beyond the loaded memory (including the bounded change log), and does not claim durable archiving or production readiness. No database, authentication, permissions, deployment or production calls were changed or performed for this draft.

## Review checks

Automated tests cover the protected active statuses, seven-day boundary, terminal statuses, recent/invalid/future activity, blockers, preservation of inputs, repeated sweeps and the rendered manual button/Trash flow. Before any release, check narrow mobile and desktop layouts, keyboard use, long task details and signed-in behavior on an authorised test system. Device and live signed-in checks were not performed.
