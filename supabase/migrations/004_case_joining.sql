alter table case_progress
add column if not exists joined_at timestamptz;
