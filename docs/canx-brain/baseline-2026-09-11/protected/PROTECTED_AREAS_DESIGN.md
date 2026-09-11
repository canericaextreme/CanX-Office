# Protected Areas Design — Empty by Intention

The protected areas are designed here but contain no business-confidential files, personal records, journal content, investments, estate instructions, beneficiary information, passwords, keys, or recovery codes.

## Four-space model

| Space | Purpose | Initial state | Normal model access |
|---|---|---|---|
| Operational | CanX plans, projects, decisions, goals, status, and rules needed for daily work | Populated by this transfer pack | Minimum records needed for an authorized task |
| Business Protected | Contracts, detailed finances, investments held by the business, tax working papers, privileged legal material, confidential partner records | Empty and disconnected | None until task-specific owner approval |
| Personal | Journals, family records, personal investments, health, photographs, stories, and private correspondence | Empty and disconnected | None by default |
| Legacy | Succession map, estate-facing instructions, recipient packages, values, stories, and controlled handoff material | Empty and disconnected | None until a legally reviewed release condition is satisfied |

## Security design

- CanX-owned storage and database.
- Deny by default; no anonymous access.
- Owner MFA required for all protected spaces.
- Separate access grants for each vault and each recipient or worker role.
- Separate encryption boundary for high-sensitivity files, with keys kept outside prompts and outside ordinary knowledge tables.
- Short-lived signed access to protected documents; no permanent public file links.
- Every read, export, grant, revoke, release, and failed attempt is audited.
- Model access goes through a broker that selects the minimum relevant records and logs the model, task, record versions, and purpose.
- Models receive content only for the current authorized task. They never receive an entire protected vault by default.
- Exports are encrypted and require a separate recovery procedure.
- Credentials remain in a password manager or approved secrets system; the Brain stores only connection status and recovery instructions that do not reveal the credential.

## Business Protected vault

Designed future sections:

- ownership and corporate records;
- contracts and partner agreements;
- tax working papers and professional advice;
- detailed investments and accounts;
- confidential bids and procurement work;
- payroll or employee information;
- privileged legal correspondence.

Default access: John only. Accountant, lawyer, or successor access must be scoped by role, document class, purpose, and expiry.

## Personal vault

Designed future sections:

- journals and talks;
- family history, stories, photographs, and recordings;
- personal investment records;
- health and insurance records;
- important people and contact context;
- travel journals and private Trail Tales exports.

Default access: John only. Nothing moves automatically from Gmail, Drive, Trail Tales, or ChatGPT into this vault.

## Legacy vault

Designed future sections:

- inventory of CanX and personal assets;
- successor map and role instructions;
- recipient-specific packages;
- explanation of important decisions and values;
- location of legal instruments and professional contacts;
- continuity playbooks for illness, incapacity, retirement, or death;
- audit of what was released, to whom, by whose authority, and when.

The Legacy vault is not a will, trust, power of attorney, or legal transfer. A lawyer-qualified plan and signed legal instruments remain necessary.

## Release safeguards

- No single shared “secret password” unlocks everything.
- No automatic dead-man switch is enabled.
- Release requires a defined legal authority, verified identity, MFA, recipient scope, and an auditable approval or legally reviewed condition.
- Each recipient sees only their assigned package.
- Emergency recovery does not bypass audit or expand access beyond the approved package.
- Release can be rehearsed with synthetic data before real content is added.

## Population gate

Before any protected content is imported, John must approve:

1. the exact vault and categories;
2. the source account or files;
3. who may read them;
4. which models may access them and for what tasks;
5. retention and deletion rules;
6. backup and recovery location;
7. legacy release authority where applicable.

