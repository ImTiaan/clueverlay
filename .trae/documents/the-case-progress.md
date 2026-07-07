## Current Progress

The project has completed Phase 1 foundation work and now has a working local Phase 2 runtime path.

- React + Express TypeScript app scaffolded
- Core routes created for `/`, `/overlay`, and `/admin`
- Shared game types and defaults created
- Initial Supabase schema migration written and applied remotely
- Seed rows created for `game_state` and `game_settings`
- Public leaderboard API, runtime API, and admin control/settings APIs created
- Basic page shells created for leaderboard, overlay, and admin
- Environment template added for Supabase, Twitch, and admin config
- EventSub webhook route now supports signature verification, callback verification, and command handling flow
- Chat command parser implemented for player commands and admin `!case` commands
- Central game service implemented for runtime reads, admin actions, fuzzy matching, guess caps, and first-pass player command handling
- Command cooldown persistence added through a second Supabase migration
- Backend env bootstrap fixed so local `.env` is loaded before Supabase/Twitch modules initialise
- Minimal scheduler implemented for `scene_intro -> suspect_intro -> suspect_speaking -> investigation_open`, plus accusation-result/post-case/timeout transitions
- Sample ready-to-play case seeded through a third Supabase migration for local testing
- Overlay now refreshes runtime data on an interval so local phase changes are visible in the browser
- Local verification completed: admin `start` works and runtime advances into `investigation_open`
- Type-check, tests, diagnostics, and production build all passing

## What Is Still Missing

Phase 2 and beyond are still incomplete.

- Full live Twitch validation for outbound chat responses and EventSub subscriptions
- Rich overlay state rendering for accusation results, timeout reveals, and styled avatar presentation
- Overlay live subscriptions via Supabase Realtime instead of interval polling
- Real season lifecycle and resets
- Content ingestion pipeline, avatar normalisation/storage pipeline, and batch review tools
- Stream-day hardening, production env setup, and end-to-end deployment verification

## Immediate Next Work

The next active implementation step is to turn the working local runtime into a fuller end-to-end stream loop.

1. Exercise and verify outbound Twitch chat sending against the broadcaster account
2. Add richer scheduler side-effects (game events/chat narration) and tighten post-case rotation behaviour
3. Move the overlay from interval polling to Supabase Realtime subscriptions
4. Add case ingestion and avatar generation tooling for ready-to-play content
5. Finish stream operations, deployment, and end-to-end Twitch verification
