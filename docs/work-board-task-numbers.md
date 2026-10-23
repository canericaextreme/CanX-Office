# Work Board date numbers — blocked database work

The local 22 October 2026 change implements task status colours and wrapping on
Work Board cards. It does **not** implement `WB-MM-DD-YYYY-N` allocation.
Existing task identifiers and task-creation behaviour are unchanged.

The current task contract has a UUID `id`, creation timestamp and editable task
content, but no immutable short identifier or atomic daily sequence. Several
paths create tasks (the board, Manager tools and companion decisions). Computing
N from the currently loaded list, browser storage or a read-then-insert request
would permit duplicates across concurrent requests/devices. Deriving numbers on
each render could renumber records and would not preserve existing identifiers.
Task titles, details and evidence must not be repurposed as identifier storage.

Completing numbering requires a separately authorised database change: an
additive immutable task-number field, atomic daily allocation shared by all
creation paths, and uniqueness enforcement. Keep historical rows unchanged and
retain UUIDs for links and relationships. Decide the calendar timezone and
whether N counts all tasks created that day or only tasks under the new scheme.
Then expose the saved short number in the task contract and board, with legacy
fallback, and test midnight rollover, concurrent creation, retries and legacy
records. No migration or partial number generator is included in this change.

Status colours are presentation only. Red risk overrides completion and stale
states; yellow denotes waiting, stale, cancelled, unknown or active yellow-risk
work; green denotes clear planned/assigned work or done. Labels and evidence
still distinguish assignment from execution and verification. Permission and
approval checks are unchanged.

Before acceptance, check the populated board on a narrow phone and desktop,
including long unbroken titles, project names, evidence, expanded editing forms,
and approval controls. Local fixture tests are not signed-in or device checks.
