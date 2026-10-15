-- Shared lookup cache for /api/enrich-reel, so a Reel or a Google Maps place is scraped once
-- and reused by everyone who saves it. Written and read only by the server with the service role
-- key (SUPABASE_SERVICE_ROLE_KEY on Vercel): RLS is on with no policies, so app users can't
-- read or change it. Safe to run more than once.

-- One row per Instagram Reel (key = https://www.instagram.com/reel/<code>/).
-- data = { place: { placeName, location, venue }, candidates: [Google Maps results] | null }
-- Only what a lookup needs is kept: never the caption, hashtags, creator or cover.
create table if not exists public.reel_lookups (
  key text primary key check (char_length(key) <= 512),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- One row per Google Maps place (key = the place's Maps link). data = the place's details.
create table if not exists public.place_lookups (
  key text primary key check (char_length(key) <= 2048),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.reel_lookups enable row level security;
alter table public.place_lookups enable row level security;
revoke all on public.reel_lookups from anon, authenticated;
revoke all on public.place_lookups from anon, authenticated;

-- Optional clean-up of old rows (the server ignores rows older than 30 / 14 days anyway):
--   delete from public.reel_lookups where updated_at < now() - interval '60 days';
--   delete from public.place_lookups where updated_at < now() - interval '60 days';
