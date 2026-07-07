create table if not exists twitch_auth_tokens (
  channel_id text primary key,
  access_token text not null,
  refresh_token text,
  token_user_id text,
  token_login text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table twitch_auth_tokens enable row level security;
