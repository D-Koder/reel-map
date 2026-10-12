-- Save a reel from the iPhone share sheet without opening the app.
-- The Shortcut sends { key, url } to /api/save-reel, which calls save_shared_reel() below.
-- The reel waits in shared_reels until the app next opens, then goes through the normal inbox lookup.
-- Safe to run more than once.

-- One secret key per user. It identifies the user to the Shortcut, so it is only readable by its owner.
create table if not exists public.shortcut_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  key text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

alter table public.shortcut_keys enable row level security;

drop policy if exists "Users read their own shortcut key" on public.shortcut_keys;
create policy "Users read their own shortcut key"
  on public.shortcut_keys for select to authenticated
  using (user_id = (select auth.uid()));

-- Reels sent by the Shortcut, waiting for the app to pick them up.
create table if not exists public.shared_reels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null check (char_length(url) <= 2048 and url ~* '^https?://'),
  created_at timestamptz not null default now()
);

create index if not exists shared_reels_user_created_idx on public.shared_reels (user_id, created_at);

alter table public.shared_reels enable row level security;

drop policy if exists "Users read their own shared reels" on public.shared_reels;
create policy "Users read their own shared reels"
  on public.shared_reels for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users delete their own shared reels" on public.shared_reels;
create policy "Users delete their own shared reels"
  on public.shared_reels for delete to authenticated
  using (user_id = (select auth.uid()));

-- The signed-in user's key, made on first use.
create or replace function public.get_shortcut_key()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_key text;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  insert into public.shortcut_keys (user_id) values (v_user) on conflict (user_id) do nothing;
  select key into v_key from public.shortcut_keys where user_id = v_user;
  return v_key;
end;
$$;

-- A new key. The old one stops working, so a leaked key can be cut off.
create or replace function public.reset_shortcut_key()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_key text;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  insert into public.shortcut_keys (user_id) values (v_user)
  on conflict (user_id) do update
    set key = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), created_at = now()
  returning key into v_key;
  return v_key;
end;
$$;

-- Called by /api/save-reel with the anon key. The Shortcut may send the whole shared text, so the
-- first link in it is used. Returns 'saved' or 'duplicate'. At most 60 reels an hour per user.
create or replace function public.save_shared_reel(p_key text, p_url text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_url text;
begin
  select user_id into v_user from public.shortcut_keys where key = btrim(coalesce(p_key, ''));
  if v_user is null then
    raise exception 'Unknown shortcut key' using errcode = '28000';
  end if;

  v_url := substring(coalesce(p_url, '') from 'https?://[^[:space:]]+');
  if v_url is null or char_length(v_url) > 2048 then
    raise exception 'No link found' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.shared_reels
    where user_id = v_user and url = v_url and created_at > now() - interval '1 day'
  ) then
    return 'duplicate';
  end if;

  if (
    select count(*) from public.shared_reels
    where user_id = v_user and created_at > now() - interval '1 hour'
  ) >= 60 then
    raise exception 'Too many reels this hour' using errcode = '54000';
  end if;

  insert into public.shared_reels (user_id, url) values (v_user, v_url);
  return 'saved';
end;
$$;

revoke execute on function public.get_shortcut_key() from public, anon;
revoke execute on function public.reset_shortcut_key() from public, anon;
revoke execute on function public.save_shared_reel(text, text) from public;
grant execute on function public.get_shortcut_key() to authenticated;
grant execute on function public.reset_shortcut_key() to authenticated;
grant execute on function public.save_shared_reel(text, text) to anon, authenticated;
