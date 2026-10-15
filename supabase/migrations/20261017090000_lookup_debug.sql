-- Lookups worth a second look: reel inbox lookups that matched no place (/api/enrich-reel) and
-- reports sent with the warning button on the add-place sheet (/api/report-lookup).
-- Written and read only by the server with the service role key: RLS is on with no policies.
-- Safe to run more than once, and on a project where the table was made by hand.
create table if not exists public.lookup_debug (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table public.lookup_debug
  add column if not exists reel_url text not null default '',
  add column if not exists from_cache boolean not null default false,
  add column if not exists caption text,
  add column if not exists creator text,
  add column if not exists location_tag text,
  add column if not exists place_name text,
  add column if not exists location text,
  add column if not exists venue text,
  add column if not exists query text,
  add column if not exists candidates jsonb not null default '[]'::jsonb,
  add column if not exists reason text,
  -- What the person said went wrong (reports only).
  add column if not exists comment text,
  -- The rest of the form when reported: searched link, address, picked place, category,
  -- collection, vibe, custom info, event date, entry link.
  add column if not exists details jsonb not null default '{}'::jsonb;

create index if not exists lookup_debug_created_at_idx on public.lookup_debug (created_at desc);

alter table public.lookup_debug enable row level security;
revoke all on public.lookup_debug from anon, authenticated;
