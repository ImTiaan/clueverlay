create extension if not exists pgcrypto;

create type case_status as enum ('draft', 'ready', 'active', 'solved', 'expired', 'culled');
create type player_rank as enum ('Rookie', 'Detective', 'Senior Detective', 'Chief Detective');

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  scene_narrative text not null,
  victim_name text not null,
  victim_description text not null,
  victim_avatar_url text,
  guilty_suspect_id uuid,
  solution_summary text not null,
  evidence_items jsonb not null default '[]'::jsonb,
  suspect_count integer not null check (suspect_count between 3 and 5),
  evidence_count integer not null check (evidence_count between 3 and 5),
  status case_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists suspects (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  name text not null,
  description text not null,
  avatar_url text,
  statement_v1 text not null,
  statement_v2 text not null,
  sort_order integer not null,
  created_at timestamptz not null default now()
);

alter table cases
  add constraint cases_guilty_suspect_id_fkey
  foreign key (guilty_suspect_id)
  references suspects(id)
  on delete set null;

create table if not exists players (
  twitch_user_id text primary key,
  display_name text not null,
  points integer not null default 0,
  rank player_rank not null default 'Rookie',
  season integer not null default 1,
  permanent_title text,
  cases_solved integer not null default 0,
  correct_accusations integer not null default 0,
  wrong_accusations integer not null default 0,
  evidence_examined_total integer not null default 0,
  last_case_accused uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists case_progress (
  player_id text not null references players(twitch_user_id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  statements_requested integer not null default 0,
  examined_items jsonb not null default '[]'::jsonb,
  accusations jsonb not null default '[]'::jsonb,
  guess_count integer not null default 0 check (guess_count between 0 and 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, case_id)
);

create table if not exists game_state (
  channel_id text primary key,
  enabled boolean not null default false,
  paused boolean not null default false,
  active_case_id uuid references cases(id) on delete set null,
  phase text not null default 'idle',
  current_suspect_index integer,
  phase_started_at timestamptz,
  phase_ends_at timestamptz,
  paused_at timestamptz,
  last_event_id uuid,
  updated_at timestamptz not null default now()
);

create table if not exists game_settings (
  channel_id text primary key,
  scene_intro_seconds integer not null default 30,
  suspect_intro_gap_seconds integer not null default 5,
  suspect_statement_interval_seconds integer not null default 75,
  post_case_countdown_seconds integer not null default 20,
  case_timeout_minutes integer not null default 45,
  cooldown_examine_seconds integer not null default 3,
  cooldown_ask_seconds integer not null default 10,
  cooldown_accuse_seconds integer not null default 20,
  updated_at timestamptz not null default now()
);

create table if not exists game_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cases_status on cases(status);
create index if not exists idx_suspects_case_id on suspects(case_id);
create index if not exists idx_game_events_case_id_created_at on game_events(case_id, created_at desc);

create or replace view public_leaderboard as
select
  twitch_user_id,
  display_name,
  points,
  rank,
  season,
  permanent_title,
  cases_solved,
  correct_accusations,
  wrong_accusations,
  evidence_examined_total,
  case
    when correct_accusations + wrong_accusations = 0 then 0
    else round((correct_accusations::numeric / (correct_accusations + wrong_accusations)::numeric) * 100)
  end as accusation_accuracy
from players;

create or replace view public_runtime_cases as
select
  id,
  scene_narrative,
  victim_name,
  victim_description,
  victim_avatar_url,
  suspect_count,
  evidence_count,
  status,
  created_at,
  updated_at
from cases
where status in ('ready', 'active', 'solved', 'expired');

create or replace view public_runtime_suspects as
select
  id,
  case_id,
  name,
  description,
  avatar_url,
  sort_order
from suspects;

grant usage on schema public to anon, authenticated;
grant select on game_state to anon, authenticated;
grant select on public_leaderboard to anon, authenticated;
grant select on public_runtime_cases to anon, authenticated;
grant select on public_runtime_suspects to anon, authenticated;

alter table cases enable row level security;
alter table suspects enable row level security;
alter table players enable row level security;
alter table case_progress enable row level security;
alter table game_state enable row level security;
alter table game_settings enable row level security;
alter table game_events enable row level security;

create policy "Public read game_state"
on game_state
for select
to anon, authenticated
using (true);

insert into game_state (
  channel_id,
  enabled,
  paused,
  phase,
  updated_at
)
values (
  'default',
  false,
  false,
  'idle',
  now()
)
on conflict (channel_id) do nothing;

insert into game_settings (
  channel_id,
  scene_intro_seconds,
  suspect_intro_gap_seconds,
  suspect_statement_interval_seconds,
  post_case_countdown_seconds,
  case_timeout_minutes,
  cooldown_examine_seconds,
  cooldown_ask_seconds,
  cooldown_accuse_seconds,
  updated_at
)
values (
  'default',
  30,
  5,
  75,
  20,
  45,
  3,
  10,
  20,
  now()
)
on conflict (channel_id) do nothing;
