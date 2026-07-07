# The Case Execution Plan

## Purpose

This document is the working delivery plan for `The Case`. It is intended to be operational rather than aspirational, so it focuses on four things:

1. what is already done
2. what is currently in progress
3. what is blocking launch
4. what should happen next, in order

## Current Summary

The project already has a working local prototype with a real runtime spine. The biggest remaining risks are no longer basic implementation risks. They are production architecture, live Twitch proof, scalable content generation, asset storage, and launch hardening.

## Done

These areas are already built and usable locally.

- React + Express TypeScript application scaffold
- Supabase schema, seed state, and shared TypeScript game models
- Public runtime API and leaderboard API
- Password-protected admin controls and settings routes
- EventSub webhook route with signature verification and command parsing
- Central game service for phase transitions, cooldowns, fuzzy matching, guess caps, and scoring
- Local scheduler-driven runtime loop
- Sample seeded case for local testing
- OBS-oriented `/overlay` route with transparent page background and top-left widget layout
- Phase-aware overlay rendering with suspect and victim avatar support
- Local `.env` bootstrap fixed so the backend loads configuration reliably
- Local development stack working end to end

## In Progress

These areas exist in first-pass form, but should not yet be treated as production-ready.

- Twitch integration path exists, but has not been fully proven live against the broadcaster environment
- Overlay visual system exists, but still needs final production-grade verification across all states
- Admin and runtime controls work locally, but stream-day recovery behaviour still needs more deliberate testing
- Current content pool is enough for development, but not enough for a real running game

## Launch Blockers

These are the items that must be solved before the project can honestly be considered ready to publish and use on stream.

- Production-safe runtime architecture for timed phase progression
- Full live Twitch verification for inbound EventSub and outbound chat replies
- Production EventSub registration and callback verification
- Case generation, review, and approval pipeline
- Image generation, avatar normalisation, and Supabase Storage pipeline
- Production deployment and environment setup on Vercel
- DNS and production domain verification for `case.teewee.live`
- Stream-day monitoring, recovery, and operator workflow
- End-to-end rehearsal of the real hosted stack

## Critical Architecture Decision

The current local runtime uses an in-process scheduler loop to advance game phases. That is fine for development, but it should not be treated as a launch-ready solution for a serverless deployment target such as Vercel.

This means the first real production question is not visual polish. It is: where does the authoritative game clock live in production?

The current viable options are:

- Vercel Cron driving safe state-advance calls
- Supabase scheduled jobs handling timed progression
- a persistent worker running outside Vercel

This decision is a launch blocker because the current `setInterval` approach is local-runtime logic, not a production deployment model.

## Recommended Order

The most efficient order is to solve the production runtime model first, then prove the real Twitch loop, then replace development shortcuts, then build the scalable content pipeline, and finally harden the hosted product.

### Phase 0: Lock Production Runtime Model

Goal: decide how the scheduler and timed phase progression work in production.

- choose the authoritative scheduler strategy
- refactor runtime progression if needed so it does not depend on a permanently running local Node process
- confirm admin actions, webhook processing, and overlay state all remain consistent under the chosen model
- define the production responsibility split between Vercel, Supabase, and any background worker

Exit condition:

- there is a deployment-safe strategy for timed game progression

### Phase 1: Prove The Live Twitch Loop

Goal: confirm that the bot can reliably receive and respond to real Twitch events in the broadcaster environment.

- verify live EventSub delivery
- confirm webhook verification and signature handling against real Twitch callbacks
- test player commands from the real channel
- test admin commands from broadcaster and moderator roles
- verify outbound chat replies from the broadcaster-as-bot identity
- capture and fix any permission, scope, or delivery issues

Exit condition:

- a real Twitch chat message can drive game behaviour and receive a reliable bot response

### Phase 2: Tighten Runtime Behaviour

Goal: make the core game engine safe to trust during a live stream.

- verify `start`, `stop`, `pause`, `resume`, `skip`, `reload`, and `status`
- test solved, expired, paused, and restart recovery paths
- tighten post-case rotation behaviour
- expand scheduler side-effects where needed
- verify scoring, guess cap, and cooldown persistence under repeated use
- confirm lockout behaviour after solved or expired cases

Exit condition:

- the backend game loop behaves consistently across standard and edge-case flows

### Phase 3: Move Overlay To Realtime

Goal: remove polling and make the overlay feel immediate and production-grade.

- replace interval polling with Supabase Realtime subscriptions
- subscribe to `game_state`, active case, suspects, and relevant game events
- handle reconnect and stale state safely
- verify scene intro, suspect focus, accusation result, timeout reveal, and post-case states
- re-test OBS browser-source behaviour

Exit condition:

- overlay updates in real time and stays in sync with the stored runtime state

### Phase 4: Build The Content And Asset Pipeline

Goal: make the game sustainable by enabling repeatable case production and asset storage.

- define the case generation workflow
- define the import shape for cases and assets
- build validation for generated case content
- build a review and approval flow for drafted or generated cases
- add promotion from `draft` to `ready`
- generate suspect and victim images consistently
- normalise avatar assets
- store final assets in Supabase Storage instead of relying on live third-party URLs
- define asset naming, storage structure, and cache strategy

Exit condition:

- reviewed and approved cases can be produced and added to the playable pool reliably

### Phase 5: Deploy, Harden, And Rehearse

Goal: publish the hosted version safely and reduce stream-day failure risk.

- configure the Vercel project and production environment variables
- verify DNS and domain setup for `case.teewee.live`
- register and verify production Twitch EventSub webhook callbacks
- add logging and monitoring visibility for production failures
- define retry and failure behaviour for Twitch and Supabase issues
- prepare season reset and maintenance procedures
- prepare operator checklist for starting, pausing, resuming, and recovering the game
- run a full staged rehearsal against the hosted stack

Exit condition:

- the product can be operated on stream with a clear procedure and acceptable risk

## Immediate Next

These are the next concrete tasks to do now, in this order.

1. choose the production scheduler/runtime approach for Vercel deployment
2. verify real Twitch EventSub delivery
3. verify real outbound Twitch chat replies
4. exercise player and admin commands in the live channel
5. capture and fix Twitch-side failures or missing permissions
6. replace overlay polling with Supabase Realtime

## Later

These areas matter, but they should follow the work above rather than displace it.

- final overlay polish once Realtime is in place
- richer content tooling and batch-review UX
- more advanced seasonal operations and reporting
- broader launch marketing surfaces around the hosted site

## Working Recommendation

The short version is simple: solve the production runtime model, prove Twitch live, then build the scalable content and hosting path around that. If those first two pieces are not locked, everything else still rests on assumptions.
