alter table game_settings
add column if not exists join_window_seconds integer not null default 120;

update game_settings
set
  join_window_seconds = coalesce(join_window_seconds, 120),
  suspect_statement_interval_seconds = 150,
  updated_at = now()
where channel_id = 'default';

