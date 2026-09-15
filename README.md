# CanX Office — runbook

CanX Office is the private working office for Canerica Extreme (brand CanX). It is
not a public website: it is an owner-only workspace for decisions, projects, work,
records, systems and independent review.

## Privacy boundary

- Owner-only. The office gate fails closed: with no CanX-owned backend configured,
  no office content is rendered at all.
- The app is excluded from search engines (`robots.txt` disallows everything and the
  pages are marked `noindex, nofollow, noarchive`).
- Public page metadata stays generic. No personal names, health details or private
  room details belong in titles, descriptions or social tags.
- No secrets, keys or personal credentials belong in this repository.

## Money limits

- **C$500 / month** — total CanX Office running-cost ceiling across all services.
  It is a recorded decision, not a machine-enforced limit.
- **C$100 / month** — separate internal Manager AI sub-limit. It is an office policy
  limit, not a provider bill.
- The office does not read provider billing. Where a cost cannot be verified it is
  shown as "unknown" or "not verified" — never guessed and never shown as zero.

## Truth rule: live vs sample

Nothing is shown as connected, verified, saved, published or spent unless the office
has actually checked it and can say when. Anything else is labelled unverified,
unknown, device-only or historical, with its date.

## Commands

```sh
bun install
bun run dev         # local dev server
bun run test        # vitest run
bun run typecheck   # tsc --noEmit
bun run lint        # eslint
bun run build       # production build
```

## Protected areas

Do not change these incidentally — only on an explicit, scoped request:

- the companion/chatbot and all of its voice, audio and work paths
  (`CompanionDock`, `CompanionWorkPanel`, `use-realtime-chat`,
  `realtime-voice.functions`, `companion-work.functions`, `OfficeManager`,
  `manager.functions`, `manager-voice.functions`)
- the office visual layout: room positions, styling, class names, component order,
  responsive behaviour and animations

## Deployment and database

- **No publishing or deployment without the owner's approval.**
- **Database migrations require separate, explicit approval.** Production records are
  never altered as a side effect of a code change.
