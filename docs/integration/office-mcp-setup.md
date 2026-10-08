# Office connection setup

The read-only setup checklist and locked MCP transport are implemented. Persistent access is not active.

Before connecting ChatGPT or external Claude, finish scoped record permissions, owner consent, active-session and current-grant checks, and enable the authorization service. Authorize each external client separately. Verify a saved-record read, renewal, signed-out denial and revoked-access denial before marking it connected. Build and mailbox permissions are separate.

The first MCP increment exposes only the dated setup checklist. It does not expose private records, record editing, builds or mailbox tools. Unauthenticated calls are refused. The default empty client allowlist and missing active-session check deny all tool access.
