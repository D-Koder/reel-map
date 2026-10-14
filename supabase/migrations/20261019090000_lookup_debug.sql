-- Reel lookups that ended with "We couldn't tell which place this is. Tap Finish to pick it.",
-- kept so they can be checked later. One row per failed inbox lookup, written by /api/enrich-reel
-- with the service role key. RLS is on with no policies, so app users can't read or change it.
-- Safe to run more than once.
create table if not exists public.lookup_debug (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  reel_url text not null,
  -- True when the lookup came from the saved cache: the caption isn't kept there, so it's empty.
  from_cache boolean not null default false,
  caption text,
  creator text,
  location_tag text,
  -- What the lookup found in the caption: the place name, its address, and the 📍 / list line.
  place_name text,
  location text,
  venue text,
  -- What was searched on Google Maps, and every result it found ([] when none).
  query text,
  candidates jsonb not null default '[]'::jsonb,
  -- Why no place was picked, e.g. "Several results, none named like the place".
  reason text
);

create index if not exists lookup_debug_created_at on public.lookup_debug (created_at desc);

alter table public.lookup_debug enable row level security;
revoke all on public.lookup_debug from anon, authenticated;

-- Optional clean-up:
--   delete from public.lookup_debug where created_at < now() - interval '60 days';
