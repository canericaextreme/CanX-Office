# Data controls and budget-check diagnosis

The owner reported two confusing voice areas and no sound. The screenshot showed the new Data introduction, confirming the previous UI changes reached the live office, but also showed a spending/rate-limit check refusal.

Changes: one visible Talk with Data area; typing behind Type instead; mute/repeat behind Voice options; briefing and round-table link in Settings; one error area; voice failures replace the misleading ready status. Message scrolling is confined to its own pane and follows new messages only when the owner is near the bottom. Text input no longer steals focus after answers.

Budget check: preserve denial on every failure, but distinguish a missing RPC, denied permissions/session, absent owner limit row, reached budget and rate limits. Never show raw database details. Eight regression cases cover these denials.

Validation: 475 tests passed, TypeScript and production build passed. No limits were raised or disabled. No database migration or owner limit row was changed. The external CanX Supabase database is not available through the Lovable Cloud database connector; its database-status check returned disabled. That is not evidence that CanX's external database is missing.

The silent-voice cause remains unresolved until the live budget response is identified. The next attempt will expose the more precise error category. A screenshot of that message is sufficient; no credentials or tokens are needed in chat.
