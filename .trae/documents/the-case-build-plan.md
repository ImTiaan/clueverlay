## 1. Goal

This build plan turns the approved game specification into an executable delivery sequence for v1. The focus is to get a stable live game loop working first, then harden operations, content tooling, and launch readiness.

## 2. Delivery Principles

- Build the runtime spine first: schema, game state, and timing
- Keep one source of truth in Supabase
- Prefer simple operational control over clever automation
- Ship the public leaderboard and overlay early so the full loop is visible
- Treat content ingestion and moderation as part of the product, not a post-launch extra

## 3. Workstreams

### 3.1 Core Runtime
- Create Supabase schema and baseline seed data
- Implement game state transitions and timing engine
- Implement Twitch EventSub webhook verification and chat command parsing
- Implement scoring, cooldowns, fuzzy matching, and guess limits
- Implement restart recovery from stored `game_state`

### 3.2 Web App
- Scaffold React app for leaderboard, overlay, and admin surfaces
- Build overlay states from Supabase Realtime
- Build public leaderboard with current-season stats
- Build password-protected admin page with controls and settings editing

### 3.3 Content Pipeline
- Define case JSON ingestion shape
- Implement batch validator for generated cases
- Implement case promotion flow: `draft` -> `ready`
- Generate and normalise suspect and victim avatars
- Upload avatar assets to Supabase Storage

### 3.4 Stream Operations
- Wire admin chat commands and admin page actions to the same backend control layer
- Add clear runtime status visibility
- Test pause, skip, reload, and timeout recovery paths
- Prepare launch checklist and season reset procedure

## 4. Implementation Phases

### Phase 1: Foundation
Objective: establish the project skeleton and the persistent state model.

- Initialise the web app project structure
- Create Supabase tables, enums, and indexes
- Seed `game_state` and `game_settings`
- Add environment variable handling for Vercel, Supabase, and Twitch
- Establish shared TypeScript types for cases, players, events, and settings

Exit criteria:
- Local app boots
- Database schema exists
- Realtime and storage connectivity verified

### Phase 2: Bot And Game Engine
Objective: make the game playable in backend terms before polishing the frontend.

- Implement EventSub webhook route
- Verify Twitch signatures
- Parse player and admin commands
- Build central game service for phase transitions
- Implement cooldown enforcement and fuzzy matching helpers
- Implement scoring updates and two-guess cap
- Implement scheduled transitions for intro, suspect flow, investigation open, result, timeout, and post-case

Exit criteria:
- Simulated chat messages can move a case end to end
- Pause/resume/skip/reload all behave correctly
- Bot restart can recover active case state

### Phase 3: Overlay
Objective: make the runtime visible and stream-ready.

- Build `/overlay`
- Subscribe to Supabase Realtime for `game_state` and relevant case data
- Implement scene intro, suspect speaking, accusation result, timeout reveal, and idle states
- Add strong visual framing for `GUILTY`, `INNOCENT`, and `GOT AWAY`
- Verify transparent avatar rendering and fallback behaviour

Exit criteria:
- Overlay follows the live state machine correctly
- OBS/browser-source test passes

### Phase 4: Leaderboard And Admin
Objective: add public community visibility and safe operational control.

- Build `/` leaderboard page
- Add ranking logic and stat calculations
- Build `/admin` with password gate
- Add control actions and settings editor
- Add runtime summary panel

Exit criteria:
- Leaderboard reflects Supabase data correctly
- Admin page can control the game loop and update settings live

### Phase 5: Content Pipeline
Objective: make cases and avatars production-ready at scale.

- Build case validator and importer
- Add sample-review-friendly workflow
- Add culling process for weak cases
- Generate DiceBear suspect and victim SVGs
- Normalise and store avatar assets
- Promote approved cases to `ready`

Exit criteria:
- A reviewed case pool exists in Supabase
- Avatars load from storage, not live DiceBear URLs

### Phase 6: Hardening And Launch Prep
Objective: reduce stream risk before going live.

- Test latency and failure messaging
- Test rate limits and edge cases
- Test timeout reveal with motive summary
- Test case solved lock state
- Document operational steps for stream day
- Verify DNS and Vercel production deployment on `case.teewee.live`

Exit criteria:
- End-to-end staging session succeeds
- Launch checklist is complete

## 5. Recommended Build Order

If implementation begins immediately, this is the lowest-risk sequence.

1. Supabase schema and seed state
2. Shared types and state machine logic
3. Twitch webhook route and command handling
4. Overlay page
5. Leaderboard page
6. Admin page
7. Case ingestion and avatar pipeline
8. Hardening, tests, and deployment

## 6. Risks And Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Twitch webhook complexity | Bot commands fail or cannot be verified | Implement signature checks early and build a replayable local test harness |
| Ambiguous fuzzy matches | Wrong suspect/evidence chosen from chat | Reject ambiguous matches and keep matching rules conservative |
| Timer drift or restart issues | Overlay and bot state diverge | Keep all timing anchored to `game_state` timestamps in Supabase |
| Poor generated cases | Weak live experience | Use sample review and cull bad cases before promotion |
| Third-party avatar dependency | Runtime portrait failures | Generate during ingestion and serve from Supabase Storage |

## 7. Immediate Next Tasks

These are the first concrete build tasks I recommend after planning approval.

1. Create the initial Supabase DDL and seed rows for `game_state` and `game_settings`
2. Scaffold the Vite + React app with routes for `/`, `/overlay`, and `/admin`
3. Create shared TypeScript domain models from the approved schema
4. Implement the central game service/state machine before wiring UI components
