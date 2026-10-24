-- Latest cover image for each Reel. One row per Reel link, so a refresh serves every place that uses that Reel.
-- Instagram cover links expire, so the app refreshes a row when it is shown on screen and the row is old or broken.
create table if not exists public.reel_covers (
  reel_url text primary key,
  thumbnail_url text,
  status text not null default 'ok' check (status in ('ok', 'missing')),
  checked_at timestamptz not null default now()
);

alter table public.reel_covers enable row level security;

-- Any signed-in user can read covers and refresh them. Covers are public Reel metadata, not private data.
create policy "reel_covers: read" on public.reel_covers
  for select to authenticated
  using (true);

create policy "reel_covers: write" on public.reel_covers
  for insert to authenticated
  with check (true);

create policy "reel_covers: update" on public.reel_covers
  for update to authenticated
  using (true)
  with check (true);
