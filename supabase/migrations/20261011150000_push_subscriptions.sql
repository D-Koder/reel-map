-- Browser push subscriptions. One row per device a user has turned Friday pick notifications on for.
-- Having a row means notifications are on. Turning them off deletes the row.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Users manage only their own devices. The Friday pick function uses the service role and skips RLS.
create policy "push_subscriptions: own rows" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
