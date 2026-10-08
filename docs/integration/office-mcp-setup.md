# Office connection setup

The target is persistent shared Brain, skills, files and build access for ChatGPT, Claude and Elsie. This increment provides renewable authorization and read-only operational metadata, not the full target.

OAuth discovery now advertises authorization, registration and refresh-token endpoints. Database controls deny external OAuth clients direct record access. The scoped bridge checks the current owner, active session, approved client and unrevoked grant on every call. The owner consent route is `/oauth/consent`; each external client requires separate approval.

Isolated authorization, consent and SQL revocation tests pass. Publication, real client consent, saved-record reads and token renewal must pass before any external assistant is marked connected. Elsie uses the internal shared tool registry; signed-in handoff verification remains pending. No build or mailbox tool is exposed by this MCP increment.
