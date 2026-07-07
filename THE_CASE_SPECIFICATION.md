# THE CASE — Product And Technical Specification

## Summary

THE CASE is a Twitch chat detective game run by a bot and visualised by a browser overlay. Chat investigates a fictional crime by listening to suspects, examining evidence, and accusing a culprit before the case times out. The bot owns all pacing, narration, case rotation, and moderation-safe guardrails.

This document reflects the current locked decisions for v1 and is intended to be implementation-ready.

## Locked Decisions

The following points are now treated as product requirements rather than open questions.

- Platform: single Twitch channel only
- Hosting: Vercel on `case.teewee.live`
- Routes: `/` leaderboard, `/overlay` stream overlay, `/admin` admin page
- State source of truth: Supabase
- Live tunables: stored in Supabase, editable without redeploy
- Admin control: broadcaster + moderators via chat commands
- Admin page: simple password protection in v1
- Suspects per case: variable `3–5`
- Evidence items per case: variable `3–5`
- Names: always fictional, not pulled from the community
- Bot voice: dramatic and slightly silly
- Tone: darker, Twitch-safe, no real-world hate content, no sexual violence themes
- Match rules: fuzzy matching with prefix support and close spellings
- Wrong accusation cap: `2` guesses per player per case
- Timeout reveal: dedicated `GOT AWAY` state with culprit name and motive/solution summary
- Reveal composition: culprit only on the overlay, not victim + culprit
- Avatar system: DiceBear `adventurer`, transparent background, normalised SVGs stored by us
- Victims: every case includes a victim description and avatar
- Leaderboard: public, current season only, richer stats view
- Recovery: if the bot restarts mid-case, resume from stored Supabase state

## Core Experience

The intended player experience is a paced, bot-led investigation where chat has limited but meaningful actions.

1. The bot starts a case by posting a short "case started" message.
2. The bot immediately posts a second message that sets the scene and makes the case feel interesting.
3. The overlay shows the victim profile during this opening beat.
4. The bot introduces suspects one at a time and posts their initial statements.
5. The overlay shows the currently featured suspect profile while each suspect is being introduced or speaking.
6. Once every suspect has spoken once, chat unlocks `!examine`, `!ask`, and `!accuse`.
7. The overlay switches into an investigation board that keeps all suspect names and examinable item names visible.
8. The first correct accusation solves the case immediately.
9. Wrong accusations continue the investigation, but each player only gets two guesses.
10. If the case times out unsolved, the culprit is revealed as having got away.
11. After a short post-case beat, the next case begins.

## Commands

Player commands are intentionally minimal so the game remains legible in live chat.

### Player Commands

- `!case` — explain how to join and which commands players can use
- `!join` — opt into the currently active case so you can participate
- `!examine [item]` — return the detail for a valid evidence item
- `!ask [suspect]` — post the suspect's follow-up statement (`statement_v2`) into chat so viewers can scroll back to it
- `!accuse [suspect]` — spend one accusation attempt and resolve immediately

Player commands are gated by both case phase and participation.

- players must type `!join` after a case starts before they can use gameplay commands
- `!examine` is only available to joined players after all first statements are complete
- `!ask` is only available to joined players after all first statements are complete
- `!accuse` is only available to joined players after all first statements are complete
- all gameplay commands lock immediately after the case is solved

### Admin Commands

Admin commands are available to the broadcaster and moderators only.

- `!case start` — enable the game loop and start the next eligible case if needed
- `!case stop` — disable the game loop and hide the overlay
- `!case pause` — freeze timers and suppress automatic narration
- `!case resume` — unpause and continue from the stored phase
- `!case skip` — end the current case and rotate to the next one
- `!case reload` — reload bot state and configuration after deploy/recovery
- `!case status` — post current runtime state in chat

## Default Timing Profile

The game should move faster than the original draft. These values are defaults, not hard-coded constants, and should live in `game_settings`.

- `scene_intro_seconds`: `30`
- `suspect_intro_gap_seconds`: `5`
- `suspect_statement_interval_seconds`: `75`
- `post_case_countdown_seconds`: `20`
- `case_timeout_minutes`: `45`
- `cooldown_examine_seconds`: `3`
- `cooldown_ask_seconds`: `10`
- `cooldown_accuse_seconds`: `20`

## State Model

The bot and overlay should operate from a small global state machine rather than inferring progress from player activity.

### Runtime Phases

- `idle` — game disabled or no active case
- `scene_intro` — opening case beat and overlay intro
- `suspect_intro` — a suspect is being introduced
- `suspect_speaking` — a suspect’s main statement is live
- `investigation_open` — all first statements complete, player commands unlocked
- `accusation_result` — temporary guilty/innocent result state
- `timeout_reveal` — culprit got away reveal
- `post_case` — short hold before loading the next case

### Phase Rules

- pausing freezes the current phase timer
- pausing also suppresses automatic narration messages
- manual admin commands always override automated rotation
- on restart, the bot reloads `game_state` and resumes the current phase
- when a case starts, the bot should first announce that the case is live, then post a second scene-setting message that tells players to type `!join`

## Supabase Data Model

The schema below is the recommended v1 shape for reliable runtime behaviour and a richer leaderboard.

### Table: `cases`

```text
id (uuid, pk)
scene_narrative (text)
victim_name (text)
victim_description (text)
victim_avatar_url (text, nullable)
guilty_suspect_id (uuid, fk -> suspects.id)
solution_summary (text) — hidden until solve or timeout reveal
evidence_items (jsonb) — array of { name, detail }
suspect_count (integer)
evidence_count (integer)
status (enum) — draft, ready, active, solved, expired, culled
created_at (timestamp)
updated_at (timestamp)
```

### Table: `suspects`

```text
id (uuid, pk)
case_id (uuid, fk -> cases.id)
name (text)
description (text)
avatar_url (text, nullable)
statement_v1 (text)
statement_v2 (text)
sort_order (integer)
created_at (timestamp)
```

### Table: `players`

```text
twitch_user_id (text, pk)
display_name (text)
points (integer, default 0)
rank (enum) — Rookie, Detective, Senior Detective, Chief Detective
season (integer)
permanent_title (text, nullable)
cases_solved (integer, default 0)
correct_accusations (integer, default 0)
wrong_accusations (integer, default 0)
evidence_examined_total (integer, default 0)
last_case_accused (uuid, nullable)
created_at (timestamp)
updated_at (timestamp)
```

### Table: `case_progress`

```text
player_id (text, fk -> players.twitch_user_id)
case_id (uuid, fk -> cases.id)
joined_at (timestamp, nullable) — set when the player enters the case with `!join`
statements_requested (integer, default 0)
examined_items (jsonb) — array of evidence item names
accusations (jsonb) — array of { suspect_name, timestamp, result }
guess_count (integer, default 0)
created_at (timestamp)
updated_at (timestamp)
pk (player_id, case_id)
```

### Table: `game_state`

```text
channel_id (text, pk)
enabled (boolean)
paused (boolean)
active_case_id (uuid, nullable)
phase (text)
current_suspect_index (integer, nullable)
phase_started_at (timestamp, nullable)
phase_ends_at (timestamp, nullable)
paused_at (timestamp, nullable)
last_event_id (uuid, nullable)
updated_at (timestamp)
```

### Table: `game_settings`

```text
channel_id (text, pk)
scene_intro_seconds (integer)
suspect_intro_gap_seconds (integer)
suspect_statement_interval_seconds (integer)
post_case_countdown_seconds (integer)
case_timeout_minutes (integer)
cooldown_examine_seconds (integer)
cooldown_ask_seconds (integer)
cooldown_accuse_seconds (integer)
updated_at (timestamp)
```

### Table: `game_events`

```text
id (uuid, pk)
case_id (uuid, nullable)
event_type (text) — scene_started, suspect_intro, suspect_statement, accusation_result, timeout_reveal, case_closed
payload (jsonb)
created_at (timestamp)
```

## Scoring And Progression

Scoring should be simple enough for chat to understand while still rewarding correct play.

### Per-Case Points

- correct accusation with no prior wrong guess: `+50`
- correct accusation after one or more wrong guesses: `+30`
- wrong accusation: `-10`
- examine evidence: `+1`
- ask for statement repeat: `+0`

If a player solves the case on their second and final guess, they still receive `+30`.

### Rank Progression

- Rookie: `0`
- Detective: `200`
- Senior Detective: `500`
- Chief Detective: `1000`

### Seasons

Seasons reset every `4–6` weeks.

1. Announce season closing and allow a final 24-hour window.
2. Lock new investigations after the window closes.
3. Award permanent titles based on the final season rank.
4. Reset points and seasonal rank to Rookie.
5. Start the next season with leaderboard history cleared from the public page.

The public leaderboard only shows the current season. Permanent titles survive resets.

## Case Content Model

Each case should feel like a specific story rather than a generic puzzle.

### Required Generated Fields

- `scene_narrative`
- `victim_name`
- `victim_description`
- `solution_summary`
- `guilty_suspect_name`
- `suspects[]`
- `evidence[]`

### Case Size Rules

- suspects: `3–5`
- evidence items: `3–5`
- all names: fictional
- at least one innocent suspect should sound naturally inconsistent
- the guilty suspect should have at least one subtly implausible beat

### Safety Rules

- darker tone is allowed
- no real-world hate content
- no sexual violence themes
- keep content Twitch-safe

## Avatar Pipeline

Avatars should be cheap to generate, deterministic, and visually flexible inside the overlay.

### Suspect And Victim Avatars

- generator: DiceBear `adventurer`
- format: SVG
- background: transparent
- suspect seed: `suspects.id`
- victim seed: deterministic case-based seed
- canonical generator URL: `https://api.dicebear.com/10.x/adventurer/svg?seed=<seed>`

### Storage Rules

- generate avatars during case ingestion
- normalise SVG output before storage
- store final assets in Supabase Storage
- serve stored assets to the overlay rather than hot-linking DiceBear at runtime
- fall back to a cached generic silhouette if generation fails

## Generation Pipeline

Case generation happens offline in batches before stream time.

### Suggested JSON Output

```json
{
  "scene_narrative": "You're at a dinner party. A scream from the study. You rush in. The host lies bleeding.",
  "victim_name": "Eleanor Ashford",
  "victim_description": "Host's sister, meticulous and well-liked.",
  "solution_summary": "James killed Eleanor after learning she was about to expose his forged signatures and debts.",
  "guilty_suspect_name": "James Ashford",
  "suspects": [
    {
      "name": "James Ashford",
      "description": "Host, shaking hands.",
      "statement_v1": "I was in the kitchen getting wine. I heard the scream and ran in immediately.",
      "statement_v2": "I was in the kitchen. I heard a noise but wasn't sure what it was. I came out slowly."
    }
  ],
  "evidence": [
    {
      "name": "crystal vase",
      "detail": "Broken on the floor, with no signs of recent impact."
    }
  ]
}
```

### Validation Workflow

Validation should filter the batch before anything enters the live case pool.

1. Parse JSON and reject malformed output.
2. Ensure the guilty suspect exists in the suspects array.
3. Ensure `victim_name`, `victim_description`, and `solution_summary` are present.
4. Ensure suspect count and evidence count both fall within `3–5`.
5. Skim a sample manually for tone and quality.
6. Cull weak or unsuitable cases rather than rejecting the whole batch.
7. Generate suspect and victim avatars.
8. Store validated cases as `draft` or `ready` depending on review state.

### Prompt Template

```text
Generate one mystery case for a Twitch chat detective game. Return ONLY valid JSON, with no markdown and no preamble.

Schema:
{
  scene_narrative,
  victim_name,
  victim_description,
  solution_summary,
  guilty_suspect_name,
  suspects: [{ name, description, statement_v1, statement_v2 }],
  evidence: [{ name, detail }]
}

Constraints:
- Use 3 to 5 suspects.
- Use 3 to 5 evidence items.
- All names must be fictional.
- Include a short private solution_summary for the final reveal.
- Make at least one innocent suspect sound scattered or vague in a believable way.
- Give the guilty suspect at least one detail that feels slightly too neat or implausible on close reading.
- Evidence should subtly support the correct answer without making it trivial.
- Tone can be darker, but must remain Twitch-safe.
- Do not include real-world hate content or sexual violence themes.
```

## Bot Runtime

The bot is responsible for chat I/O, timing, state transitions, and score updates.

### Twitch Integration

- subscribe to Twitch `channel.chat.message` via EventSub
- verify Twitch webhook signatures
- parse chat commands
- send bot replies through Twitch chat API

### Recommended API Surface

- `POST /api/webhook/chat` — EventSub chat intake
- `POST /api/admin/reload` — optional admin-page action
- `POST /api/admin/control` — optional admin-page action wrapper
- `GET /api/leaderboard` — public leaderboard data

### Command Rules

#### `!examine [item]`

- reject if the case is not in `investigation_open`
- fuzzy-match against evidence names
- award `+1` only for valid item interactions
- record the item in `case_progress.examined_items`

#### `!ask [suspect]`

- reject if the case is not in `investigation_open`
- fuzzy-match against suspect names
- post `statement_v2` into chat
- if `statement_v2` is missing, fall back to `statement_v1`
- suspect introduction flow should already have posted `statement_v1` into chat earlier
- format the original suspect line as `Statement - <suspect>: <text>`
- format the asked line as `Follow-up - <suspect>: <text>`
- increment `statements_requested`

#### `!accuse [suspect]`

- reject if the case is not in `investigation_open`
- reject with a minimal message if `guess_count >= 2`
- fuzzy-match against suspect names
- if correct, resolve immediately as `GUILTY`
- if wrong, deduct `10` points and keep the case open
- increment `guess_count`

### Matching Rules

Matching should be forgiving for Twitch chat without becoming chaotic.

- case-insensitive
- allow clear prefixes
- allow close spellings
- reject ambiguous matches rather than guessing

## Overlay And Web App

The web app serves three distinct surfaces from the same deployment.

### Routes

- `/` — public leaderboard
- `/overlay` — live game overlay for OBS/browser source
- `/admin` — password-protected admin page

### Overlay Behaviour

The overlay reflects the global game state rather than individual chat messages, but chat owns the actual story narration and scene-setting text.

- `idle` and `paused` render no visible overlay box; the route should remain fully transparent for OBS
- when the overlay becomes visible, it should animate upward from below the frame
- when the overlay is hidden by `pause` or `stop`, it should animate downward out of frame before disappearing
- when the featured card changes phase, the current card should animate out and the next card should animate in rather than snapping
- `scene_intro` shows the victim portrait, name, and short descriptor only
- `suspect_intro` and `suspect_speaking` show the active suspect portrait, name, and short descriptor only
- `investigation_open` shows an investigation board with the victim name, all suspect names, and all examinable item names
- `accusation_result` shows the accused suspect with `GUILTY` or `INNOCENT`
- `timeout_reveal` shows the culprit with `GOT AWAY`
- post-solve and timeout reveals should use the hidden `solution_summary` in chat, but keep the overlay visually focused on the culprit only

### Visual Style

- position: bottom-centre within a `1920x1080` OBS/browser source canvas
- resting bottom margin: `48px`
- profile shell size: `384x308`
- investigation board shell size: `384x430`
- shell background: `#040806`
- profile layout: one featured portrait card with no long-form story text
- investigation layout: compact board with suspect list and evidence list for chat recall
- verdict colours: use the teewee green/neutral system rather than generic red/green

### Leaderboard

The leaderboard is public and should present more than just a points list.

- show current season only
- show points
- show rank and permanent title where relevant
- show solved cases
- show wrong guesses
- show accusation accuracy
- show evidence examined

### Admin Page

The admin page exists for convenience, but chat commands remain authoritative during live play.

- simple password protection in v1
- start, stop, pause, resume, skip, reload controls
- live editing of `game_settings`
- status view for current phase and active case

## Reveal Rules

End-of-case moments need to be clear and satisfying.

### On Correct Accusation

- overlay shows `GUILTY`
- chat announces the culprit and solution summary
- gameplay commands lock immediately
- next case begins after the post-case countdown

### On Wrong Accusation

- overlay shows `INNOCENT`
- case remains open
- accused player loses `10` points
- player may accuse again only if they still have guesses left

### On Timeout

- overlay shows the culprit only with `GOT AWAY`
- chat reveals culprit name plus `solution_summary`
- case status becomes `expired`
- rotate into the next ready case after the post-case countdown

## Error Handling

The live system should fail gracefully and avoid confusing chat.

- unknown suspect or evidence: return a clear not-found message
- command before investigation opens: return a clear locked-phase message
- no guesses remaining: return a minimal reply
- old case interaction after rotation: reject and point to the new investigation
- database timeout or transient failure: return a generic retry message
- avatar generation failure: use cached silhouette fallback
- bot restart: resume the interrupted case from `game_state`

## Deployment Checklist

- [ ] Supabase project created and schema applied
- [ ] Storage buckets configured for avatars
- [ ] Groq generator workflow producing valid case JSON
- [ ] Batch validation and avatar generation pipeline implemented
- [ ] Case review workflow in place for sampling and culling
- [ ] Validated cases loaded into Supabase as `ready`
- [ ] Vercel project configured with required environment variables
- [ ] DNS configured for `case.teewee.live`
- [ ] Twitch EventSub webhook registered and verified
- [ ] Routes deployed for `/`, `/overlay`, and `/admin`
- [ ] OBS/browser source tested against `/overlay`
- [ ] Leaderboard page tested against live Supabase data
- [ ] Admin controls verified for chat and web page
- [ ] Restart recovery tested mid-case
- [ ] Season reset procedure documented before launch
