create table if not exists player_command_cooldowns (
  player_id text not null references players(twitch_user_id) on delete cascade,
  command_name text not null,
  last_used_at timestamptz not null default now(),
  primary key (player_id, command_name)
);

create index if not exists idx_player_command_cooldowns_last_used_at
on player_command_cooldowns(last_used_at desc);

alter table player_command_cooldowns enable row level security;
