# Astra continuity changeover

The Office Manager uses the Astra identity while retaining the existing provider,
owner checks, database, record identifiers, audit history and voice implementation.
This is not a migration of the user's live ChatGPT session or its tools.

## Behavior

- Shared text/realtime instructions establish continuity, source honesty and the
  distinction between an idea, a reviewed goal, an approved build and finished work.
- Both Astra and the legacy Data name work in direct room, receipt and save commands.
  Historical source labels remain unchanged.
- Useful completed discussion is a candidate for a curated summary after a 12-second
  pause while the page remains open. The server filters background chatter and
  unsupported claims. An opt-out or manual Save conversation remains available.
- AI budgets and authenticator checks still apply. Failed saves are visible and require
  a manual retry; only verified readback is reported as saved. Raw turns are not archived.
  Closing the browser before confirmation can lose unsaved discussion.
- Memory loads up to 20 continuity records separately from the 30 most recent Brain
  summaries, so a handover and lasting goals are not displaced by newer discussion.
  Earlier records remain stored; this is not unlimited context or full-history retrieval.
- Brain accepts a private handover JSON array containing title/detail records. It rejects
  overlong fields, ignores supplied IDs, skips exact duplicates and creates new IDs for
  additions. Changed goals are added as a new record, not silently overwritten.
  Every import requires authenticated owner access and matching readback.

## Validation and release gates

TypeScript validation and 599 automated checks passed, including legacy commands,
append-only handover imports, duplicate import behavior, chatter filtering, memory
retention and the existing owner/budget/voice checks. Production build passed.
These are not proof of a live spoken conversation or production database writes.

Before calling the live changeover complete:

1. Publish the tested commit through the existing Lovable project.
2. Complete the owner's normal authenticator step.
3. Read and preserve the existing Brain records, then import the separately kept
   private handover. Never commit personal handover content to this public repository.
4. Verify identity, recall of a handover goal and an existing saved decision.
5. Complete a live text and spoken exchange with interruption, confirm summary
   readback, reopen the Office, and verify recall again.

At preparation the Office required authenticator verification, and the Lovable
project required a fresh sign-in. No production memory write or live voice test
was performed. No database migration, permission expansion or card use is included.
