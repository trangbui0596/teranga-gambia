-- Community Circle: notices posted by the community champion (flood, closed road, storm, boats paused, tours closed).
-- Fixed kinds only; the place is a short free-text name. Service-role access only (RLS on, no policies), like every table.
create table if not exists public.community_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('flood','road','storm','boats','closed','clear')),
  place text check (place is null or char_length(place) <= 60),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  cleared_at timestamptz,
  posted_by text not null
);
alter table public.community_alerts enable row level security;
create index if not exists community_alerts_active_idx on public.community_alerts (expires_at) where cleared_at is null;
