# Source Register

| Source ID | Source | Date/version | Used for | Limitation |
|---|---|---|---|---|
| SRC-CHAT-CONTEXT | Relevant prior ChatGPT work and remembered decisions | Retrieved 2026-09-11 | Profile, goals, preferences, project decisions, current concerns | Relevant retrieval, not a complete byte-for-byte account export |
| SRC-CURRENT-REQUEST | John's current knowledge-transfer instruction | 2026-09-11 | Scope, protected areas, secrets boundary, approval boundary | Current instruction only |
| SRC-OFFICE-MASTER | `CanX_Office_Master_Prompt_v1.2.md` | v1.2, prepared 2026-09-08/09 | Office mission, rooms, manager model, approvals, finance, Brain, portability | Planning document; not proof of implementation |
| SRC-OFFICE-SETUP | `CanX-Office-Setup.sql.txt` | 2026-09-09 | Owner roles, MFA/RLS, audit, AI limits, receipts | Historical setup script; current applied state not directly re-verified |
| SRC-SH-ARCH | `Safe_Highways_Canada_Master_Architecture_v2.0.docx` | v2.0, August 2026 | Safe Highways architecture, roles, workflow, commercial and safety boundaries | Architecture; not current production proof |
| SRC-SH-IP | `Canerica_Extreme_CanX_Safe_Highways_Canada_Founder_Ownership_and_IP_Control_v1.0.docx` | v1.0, 2026-08-22 | Ownership, CanX control, transfer and succession boundaries | Not a substitute for legal advice or an executed succession agreement |
| SRC-TRAIL-MASTER | `Trail_Tales_Master_Plan_and_Lovable_Build_Prompt.docx` | 2026-08-27 | Trail Tales purpose, privacy, offline architecture, release gates | Contains January 2027 trip timing that may be superseded |
| SRC-LOV-WORKSPACE | Connected Lovable workspace and 11-project inventory | Retrieved 2026-09-11 | Project names, publish state, update dates, descriptions | Lovable `completed` means the agent turn/build completed, not business readiness |
| SRC-LOV-OFFICE | CanX Office knowledge, files, migrations, messages, and edit history | Through commit `48e61507dd20552203262849679e7d6b4b8416c6` | Current Office structure and code history | Production database rows were not queried |
| SRC-LOV-SH | Safe Highways project messages and audits | Through 2026-09-08 | Offline findings, shared backend, seeded demo-data status | No new production or phone test was run during this transfer |
| SRC-LOV-TRAIL | Trail Tales project messages and audits | Through 2026-08-31 | Journey rollover and PWA/offline status | Exact current trip dates remain unresolved |
| SRC-LOV-PROTOTYPES | AI Guardian, Trust Lens, Skill Creator Buddy, My Best Life, Credit Tracker, Safe BC project records | July–August 2026 | Prototype inventory | Active/parked/archived state needs John’s decision |

## Source priority

1. John's current exact instruction.
2. Protected ownership, security, privacy, evidence, and safety requirements.
3. Current approved project constitution or architecture.
4. Verified current implementation evidence.
5. Older plans and conversation summaries.

When two sources conflict, retain both, mark the conflict, and request a decision only if the conflict affects the next action.

