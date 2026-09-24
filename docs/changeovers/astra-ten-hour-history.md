# Ten-hour Office conversation restoration

This change restores the verified owner's completed exchanges from the existing
astra_recent_context table when OfficeManager opens. Reads are paginated within
a rolling ten-hour window and restricted to office-manager. Failed reads block
new text/voice starts and expose a retry control; connectivity recovery retries.
Recent-turn cleanup cannot delete rows less than ten hours old and cannot prune
other conversation keys. Existing owner verification and database RLS remain.

Validation: TypeScript and 32 focused history, continuity, and voice-memory tests
passed. Live database verification, deployment, and Android disconnect/reopen
validation remain required. No paid provider was activated.

Limits: this does not embed a ChatGPT session, sync native ChatGPT transcripts,
add offline capture, or recover unsent/unacknowledged turns. Existing completed
turn storage truncates each turn to 4,000 characters. Model context remains
bounded separately from the restored transcript. Existing pause-based summaries
remain; there is no new durable ten-hour scheduler or summary-before-prune
transaction. The ten-hour window is a retention minimum, not an exact expiry.
The restore endpoint fails explicitly above 10,000 lines rather than silently
returning a partial history. Server-side database jobs must also be inspected
for independent cleanup rules before promising a production retention guarantee.
