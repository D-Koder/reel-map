-- Baseline: the whole database as it is live on 2026-10-24, in one file.
--
-- It replaces the 53 earlier migrations (kept in supabase/migrations_archive), which no longer built the
-- live database: several tables, columns and functions were made by hand in the SQL editor and were
-- never written down. This file was read back from the live project, so a new project (staging, test)
-- built from it matches live.
--
-- Builds on an empty database with Supabase's own schemas (auth, storage, realtime, vault).
-- Not for the live project, which already has all of this (see supabase/README.md).
-- What depends on a project's own address (push, scheduled jobs) is in the next file.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- ============================================================================ tables

create table public.profiles (
  id uuid not null,
  display_name text not null,
  avatar text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  last_activity_at timestamptz,
  avatar_url text,
  timezone text not null default 'UTC',
  country text,
  collection_order uuid[]
);

create table public.venues (
  id uuid not null default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  hours jsonb,
  phone text,
  booking_url text,
  maps_url text,
  created_at timestamptz not null default now(),
  website_url text,
  menu_url text
);

create table public.places (
  id uuid not null default gen_random_uuid(),
  name text not null,
  category text not null,
  reel_url text,
  address text,
  lat double precision,
  lng double precision,
  hours jsonb,
  phone text,
  booking_url text,
  website_url text,
  subtitle text,
  menu_url text,
  menu jsonb,
  maps_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  venue_id uuid,
  custom_info text,
  url text
);

create table public.collections (
  id uuid not null default gen_random_uuid(),
  name text not null,
  emoji text,
  is_private boolean not null default false,
  owner_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_locked boolean not null default false,
  is_inbox boolean not null default false
);

create table public.collection_members (
  collection_id uuid not null,
  user_id uuid not null,
  role text not null default 'viewer',
  created_at timestamptz not null default now()
);

-- A place in a collection, with that collection's own name, category, event days and location.
-- event_runs: [{ "start": "2026-11-13", "end": "2026-11-15", "open": "11:00", "close": "22:00" }]
-- (open and close are optional; a run without them is on all day). event_date and event_end_date stay
-- as the first and last day overall.
create table public.collection_places (
  collection_id uuid not null,
  place_id uuid not null,
  added_by uuid not null default auth.uid(),
  added_at timestamptz not null default now(),
  shared_by uuid,
  copied_from_collection_id uuid,
  copied_from_place_id uuid,
  custom_name text,
  custom_emoji text,
  reel_url text,
  reel_thumbnail_url text,
  category text not null,
  event_date date,
  event_end_date date,
  venue_id uuid,
  address text,
  lat double precision,
  lng double precision,
  hours jsonb,
  phone text,
  booking_url text,
  maps_url text,
  event_runs jsonb,
  event_price text,
  event_contact text
);

create table public.bookings (
  place_id uuid not null,
  booked_by uuid not null default auth.uid(),
  planned_at timestamptz not null,
  done_at timestamptz,
  marked_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  collection_id uuid not null
);

create table public.reactions (
  place_id uuid not null,
  user_id uuid not null default auth.uid(),
  feeling text not null,
  created_at timestamptz not null default now(),
  collection_id uuid not null
);

create table public.place_order (
  user_id uuid not null default auth.uid(),
  collection_id uuid not null,
  place_id uuid not null,
  "position" double precision not null
);

create table public.collection_invites (
  id uuid not null default gen_random_uuid(),
  collection_id uuid not null,
  code text not null,
  invited_by uuid not null,
  invited_email text,
  accepted_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_by uuid
);

create table public.notifications (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  message text not null,
  collection_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.activity_days (
  user_id uuid not null,
  day date not null
);

create table public.push_subscriptions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Reels shared from the iPhone Shortcut, waiting for the app (or looked up on the server).
create table public.shortcut_keys (
  user_id uuid not null,
  key text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  connected_at timestamptz
);

create table public.shared_reels (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  url text not null,
  created_at timestamptz not null default now(),
  looking_since timestamptz,
  lookup jsonb
);

-- Server-only caches and logs (no policies: only the service key reads or writes them).
create table public.reel_lookups (
  key text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.place_lookups (
  key text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.lookup_debug (
  id bigint generated always as identity,
  created_at timestamptz not null default now(),
  reel_url text not null,
  from_cache boolean not null default false,
  caption text,
  creator text,
  location_tag text,
  place_name text,
  location text,
  venue text,
  query text,
  candidates jsonb not null default '[]'::jsonb,
  reason text,
  comment text,
  logs text
);

-- Hourly counters for the lookup endpoints (see count_api_call).
create table private.api_calls (
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  hour timestamptz not null,
  calls integer not null default 0,
  primary key (user_id, endpoint, hour)
);

-- ============================================================================ keys and checks

alter table public.profiles
  add constraint profiles_pkey primary key (id),
  add constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade,
  add constraint profiles_country_check check (country is null or (char_length(country) >= 1 and char_length(country) <= 60)),
  add constraint profiles_display_name_length check (char_length(btrim(display_name)) >= 1 and char_length(btrim(display_name)) <= 40);

alter table public.venues
  add constraint venues_pkey primary key (id),
  add constraint venues_lat_check check (lat >= -90 and lat <= 90),
  add constraint venues_lng_check check (lng >= -180 and lng <= 180);

alter table public.places
  add constraint places_pkey primary key (id),
  add constraint places_venue_id_fkey foreign key (venue_id) references public.venues (id) on delete set null,
  add constraint places_category_check check (category = any (array['cafe', 'food', 'event', 'other'])),
  add constraint places_custom_info_check check (char_length(custom_info) <= 120),
  add constraint places_lat_check check (lat >= -90 and lat <= 90),
  add constraint places_lng_check check (lng >= -180 and lng <= 180),
  add constraint places_name_length check (char_length(btrim(name)) >= 1 and char_length(btrim(name)) <= 80);

alter table public.collections
  add constraint collections_pkey primary key (id),
  add constraint collections_owner_id_fkey foreign key (owner_id) references public.profiles (id) on delete cascade;

alter table public.collection_members
  add constraint collection_members_pkey primary key (collection_id, user_id),
  add constraint collection_members_collection_id_fkey foreign key (collection_id) references public.collections (id) on delete cascade,
  add constraint collection_members_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade,
  add constraint collection_members_role_check check (role = any (array['owner', 'editor', 'viewer']));

alter table public.collection_places
  add constraint collection_places_pkey primary key (collection_id, place_id),
  add constraint collection_places_added_by_fkey foreign key (added_by) references public.profiles (id) on delete cascade,
  add constraint collection_places_collection_id_fkey foreign key (collection_id) references public.collections (id) on delete cascade,
  add constraint collection_places_place_id_fkey foreign key (place_id) references public.places (id) on delete cascade,
  add constraint collection_places_shared_by_fkey foreign key (shared_by) references public.profiles (id) on delete set null,
  add constraint collection_places_venue_id_fkey foreign key (venue_id) references public.venues (id) on delete set null,
  add constraint collection_places_copied_from_fk foreign key (copied_from_collection_id, copied_from_place_id)
    references public.collection_places (collection_id, place_id) on delete set null,
  add constraint collection_places_category_check check (category = any (array['cafe', 'food', 'event', 'other'])),
  add constraint collection_places_custom_emoji_check check (custom_emoji is null or (char_length(custom_emoji) >= 1 and char_length(custom_emoji) <= 16)),
  add constraint collection_places_custom_name_check check (custom_name is null or (char_length(btrim(custom_name)) >= 1 and char_length(btrim(custom_name)) <= 80)),
  add constraint collection_places_event_contact_length check (event_contact is null or char_length(event_contact) <= 120),
  add constraint collection_places_event_end_after_start check (event_end_date is null or event_date is null or event_end_date >= event_date),
  add constraint collection_places_event_price_length check (event_price is null or char_length(event_price) <= 60),
  add constraint collection_places_event_runs_is_array check (event_runs is null or jsonb_typeof(event_runs) = 'array'),
  add constraint collection_places_lat_check check (lat >= -90 and lat <= 90),
  add constraint collection_places_lng_check check (lng >= -180 and lng <= 180);

alter table public.bookings
  add constraint bookings_pkey primary key (collection_id, place_id),
  add constraint bookings_booked_by_fkey foreign key (booked_by) references public.profiles (id) on delete cascade,
  add constraint bookings_marked_by_fkey foreign key (marked_by) references public.profiles (id) on delete cascade,
  add constraint bookings_place_id_fkey foreign key (place_id) references public.places (id) on delete cascade,
  add constraint bookings_collection_place_fkey foreign key (collection_id, place_id)
    references public.collection_places (collection_id, place_id) on update cascade on delete cascade,
  add constraint bookings_done_marker check ((done_at is null) = (marked_by is null));

alter table public.reactions
  add constraint reactions_pkey primary key (collection_id, place_id, user_id),
  add constraint reactions_place_id_fkey foreign key (place_id) references public.places (id) on delete cascade,
  add constraint reactions_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade,
  add constraint reactions_collection_place_fkey foreign key (collection_id, place_id)
    references public.collection_places (collection_id, place_id) on update cascade on delete cascade,
  add constraint reactions_feeling_check check (feeling = any (array['keen', 'maybe', 'meh']));

alter table public.place_order
  add constraint place_order_pkey primary key (user_id, collection_id, place_id),
  add constraint place_order_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade,
  add constraint place_order_collection_place_fk foreign key (collection_id, place_id)
    references public.collection_places (collection_id, place_id) on update cascade on delete cascade;

alter table public.collection_invites
  add constraint collection_invites_pkey primary key (id),
  add constraint collection_invites_code_key unique (code),
  add constraint collection_invites_collection_id_fkey foreign key (collection_id) references public.collections (id) on delete cascade,
  add constraint collection_invites_created_by_fkey foreign key (created_by) references public.profiles (id) on delete cascade,
  add constraint collection_invites_invited_by_fkey foreign key (invited_by) references public.profiles (id) on delete cascade,
  add constraint collection_invites_accepted_count_check check (accepted_count >= 0);

alter table public.notifications
  add constraint notifications_pkey primary key (id),
  add constraint notifications_collection_id_fkey foreign key (collection_id) references public.collections (id) on delete set null,
  add constraint notifications_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.activity_days
  add constraint activity_days_pkey primary key (user_id, day),
  add constraint activity_days_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.push_subscriptions
  add constraint push_subscriptions_pkey primary key (id),
  add constraint push_subscriptions_endpoint_key unique (endpoint),
  add constraint push_subscriptions_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.shortcut_keys
  add constraint shortcut_keys_pkey primary key (user_id),
  add constraint shortcut_keys_key_key unique (key),
  add constraint shortcut_keys_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

alter table public.shared_reels
  add constraint shared_reels_pkey primary key (id),
  add constraint shared_reels_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  add constraint shared_reels_url_check check (char_length(url) <= 2048 and url ~* '^https?://');

alter table public.reel_lookups
  add constraint reel_lookups_pkey primary key (key),
  add constraint reel_lookups_key_check check (char_length(key) <= 512);

alter table public.place_lookups
  add constraint place_lookups_pkey primary key (key),
  add constraint place_lookups_key_check check (char_length(key) <= 2048);

alter table public.lookup_debug
  add constraint lookup_debug_pkey primary key (id);

-- ============================================================================ indexes

create index bookings_booked_by_idx on public.bookings using btree (booked_by);
create index bookings_marked_by_idx on public.bookings using btree (marked_by);
create index bookings_place_id_idx on public.bookings using btree (place_id);
create index idx_bookings_planned_at on public.bookings using btree (planned_at);

create index collection_invites_code_key_idx on public.collection_invites using btree (upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')));
create index collection_invites_collection_id_idx on public.collection_invites using btree (collection_id);
create index collection_invites_invited_by_idx on public.collection_invites using btree (invited_by);

create index collection_members_user_id_idx on public.collection_members using btree (user_id);

create index collection_places_added_by_idx on public.collection_places using btree (added_by);
create index collection_places_copied_from_idx on public.collection_places using btree (copied_from_collection_id, copied_from_place_id);
create index collection_places_place_id_idx on public.collection_places using btree (place_id);
create index collection_places_shared_by_idx on public.collection_places using btree (shared_by);

create unique index collections_one_inbox_per_owner on public.collections using btree (owner_id) where is_inbox;
create index collections_owner_id_idx on public.collections using btree (owner_id);

create index lookup_debug_created_at on public.lookup_debug using btree (created_at desc);

create index notifications_collection_id_idx on public.notifications using btree (collection_id);
create index notifications_user_id_idx on public.notifications using btree (user_id);

create index idx_place_order_collection on public.place_order using btree (collection_id);
create index place_order_collection_place_idx on public.place_order using btree (collection_id, place_id);

create index idx_places_category on public.places using btree (category);
create index idx_places_coordinates on public.places using btree (lat, lng);
create index places_venue_id_idx on public.places using btree (venue_id);

create index push_subscriptions_user_id_idx on public.push_subscriptions using btree (user_id);

create index reactions_place_id_idx on public.reactions using btree (place_id);
create index reactions_user_id_idx on public.reactions using btree (user_id);

create index shared_reels_user_created_idx on public.shared_reels using btree (user_id, created_at);

-- ============================================================================ private functions
-- Helpers for policies and triggers. Not reachable from the app directly.

create function private.is_collection_member(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.collection_members m
    where m.collection_id = cid and m.user_id = (select auth.uid())
  );
$$;

create function private.is_collection_owner(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.collections c
    where c.id = cid and c.owner_id = (select auth.uid())
  );
$$;

create function private.is_place_member(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.places p
    join public.collection_places cp on cp.place_id = p.id
    join public.collection_members m on m.collection_id = cp.collection_id
    where p.id = pid and m.user_id = (select auth.uid())
  );
$$;

create function private.shares_collection_with(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.collection_members a
    join public.collection_members b on b.collection_id = a.collection_id
    where a.user_id = (select auth.uid()) and b.user_id = uid
  );
$$;

create function private.can_edit_collection(p_collection_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.collections c
    where c.id = p_collection_id and c.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.collection_members m
    where m.collection_id = p_collection_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'editor')
  );
$$;

-- The role a person gets when they join with an invite.
create function private.joining_member_role()
returns text language sql stable set search_path = '' as $$
  select 'viewer'::text;
$$;

create function private.is_booking_file_member(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when (storage.foldername(object_name))[1] ~ '^[0-9a-fA-F-]{36}$'
      then private.is_collection_member(((storage.foldername(object_name))[1])::uuid)
    else false
  end;
$$;

create function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Each new account starts with Food, Events and TBD (where shared reels land).
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_collection_id uuid;
  v_default record;
begin
  insert into public.profiles (id, display_name, avatar, country)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'New user'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'avatar'), ''), '🙂'),
    left(nullif(btrim(new.raw_user_meta_data ->> 'country'), ''), 60)
  );

  for v_default in select * from (values ('Food', '🍽️', 1), ('Events', '🎉', 2), ('TBD', '📥', 3)) as d(name, emoji, sort) order by sort loop
    insert into public.collections (name, emoji, owner_id, created_at, is_inbox)
    values (v_default.name, v_default.emoji, new.id, clock_timestamp(), v_default.name = 'TBD')
    returning id into v_collection_id;

    insert into public.collection_members (collection_id, user_id, role)
    values (v_collection_id, new.id, 'owner');
  end loop;

  return new;
end;
$$;

-- Viewers can't add, change or remove places or bookings. Server code with no signed-in person is allowed.
create function private.block_viewer_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_target uuid;
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and (v_new - 'added_by') = (v_old - 'added_by') then
    return new;
  end if;
  if v_old is not null then
    v_target := (v_old ->> 'collection_id')::uuid;
    if v_target is not null
       and exists (select 1 from public.collections c where c.id = v_target)
       and not private.can_edit_collection(v_target) then
      raise exception 'Viewers can''t change places in this collection. Ask the owner to make you an editor.'
        using errcode = '42501';
    end if;
  end if;
  if v_new is not null then
    v_target := (v_new ->> 'collection_id')::uuid;
    if v_target is not null and not private.can_edit_collection(v_target) then
      raise exception 'Viewers can''t add places to this collection. Copy it to one of your own instead.'
        using errcode = '42501';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

-- A place nobody has any more is removed with its reactions and bookings.
create function private.cleanup_orphan_place()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.collection_places where place_id = old.place_id) then
    delete from public.reactions where place_id = old.place_id;
    delete from public.bookings where place_id = old.place_id;
    delete from public.places where id = old.place_id;
  end if;
  return old;
end;
$$;

create function private.fill_reaction_collection()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.collection_id is null then
    select cp.collection_id into new.collection_id
    from public.collection_places cp
    where cp.place_id = new.place_id
      and (
        exists (select 1 from public.collection_members m where m.collection_id = cp.collection_id and m.user_id = new.user_id)
        or exists (select 1 from public.collections c where c.id = cp.collection_id and c.owner_id = new.user_id)
      )
    order by cp.added_at
    limit 1;
  end if;
  return new;
end;
$$;

-- Streaks: a day counts when the person added, reacted to, booked or marked something done.
create function private.record_activity(p_user_id uuid, p_at timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into public.activity_days (user_id, day)
  select pr.id, (p_at at time zone pr.timezone)::date
  from public.profiles as pr
  where pr.id = p_user_id
  on conflict do nothing;
$$;

create function private.activity_from_collection_places()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.record_activity(new.added_by, new.added_at);
  return new;
end;
$$;

create function private.activity_from_reactions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.record_activity(new.user_id, now());
  return new;
end;
$$;

create function private.activity_from_bookings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.record_activity(new.booked_by, now());
  end if;
  if tg_op = 'UPDATE'
     and new.marked_by is not null
     and new.marked_by is distinct from old.marked_by then
    perform private.record_activity(new.marked_by, now());
  end if;
  return new;
end;
$$;

-- Notifications for the other people in a collection.
create function private.notify_place_added()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, message, collection_id)
  select m.user_id,
         'place_added',
         coalesce((select pr.display_name from public.profiles pr where pr.id = new.added_by), 'Someone')
           || ' added "' || coalesce(new.custom_name, (select p.name from public.places p where p.id = new.place_id))
           || '" to "' || (select c.name from public.collections c where c.id = new.collection_id) || '"',
         new.collection_id
  from public.collection_members m
  where m.collection_id = new.collection_id
    and m.user_id <> new.added_by;
  return new;
end;
$$;

create function private.notify_place_reacted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, message)
  select distinct r.user_id,
         'place_reacted',
         coalesce((select pr.display_name from public.profiles pr where pr.id = new.user_id), 'Someone')
           || ' reacted to "' || (select p.name from public.places p where p.id = new.place_id) || '"'
  from public.reactions r
  where r.place_id = new.place_id
    and r.user_id <> new.user_id;
  return new;
end;
$$;

create function private.notify_place_booked()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, message)
  select distinct m.user_id,
         'place_booked',
         coalesce((select pr.display_name from public.profiles pr where pr.id = new.booked_by), 'Someone')
           || ' booked "' || (select p.name from public.places p where p.id = new.place_id)
           || '" for ' || to_char(new.planned_at at time zone 'Australia/Melbourne', 'DD Mon, HH12:MI AM')
  from public.collection_places cp
  join public.collection_members m on m.collection_id = cp.collection_id
  where cp.place_id = new.place_id
    and m.user_id <> new.booked_by;
  return new;
end;
$$;

create function private.notify_place_done()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.done_at is null and new.done_at is not null then
    insert into public.notifications (user_id, type, message)
    select distinct m.user_id,
           'place_done',
           coalesce((select pr.display_name from public.profiles pr where pr.id = new.marked_by), 'Someone')
             || ' marked "' || (select p.name from public.places p where p.id = new.place_id) || '" as done'
    from public.collection_places cp
    join public.collection_members m on m.collection_id = cp.collection_id
    where cp.place_id = new.place_id
      and m.user_id <> new.marked_by;
  end if;
  return new;
end;
$$;

create function private.notify_collection_joined()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role <> 'owner' then
    insert into public.notifications (user_id, type, message, collection_id)
    select m.user_id,
           'collection_joined',
           coalesce((select pr.display_name from public.profiles pr where pr.id = new.user_id), 'Someone')
             || ' joined "' || (select c.name from public.collections c where c.id = new.collection_id) || '"',
           new.collection_id
    from public.collection_members m
    where m.collection_id = new.collection_id
      and m.user_id <> new.user_id;
  end if;
  return new;
end;
$$;

create function private.notify_collection_removed()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_private boolean;
begin
  if old.role = 'owner' or old.user_id = (select auth.uid()) then
    return old;
  end if;

  select c.name, c.is_private into v_name, v_private
  from public.collections c
  where c.id = old.collection_id;

  -- Collection is being deleted: its members are not notified here
  if v_name is null then
    return old;
  end if;

  insert into public.notifications (user_id, type, message)
  values (
    old.user_id,
    case when v_private then 'collection_private' else 'collection_left' end,
    case when v_private
      then 'You were removed from "' || v_name || '" because it was made private.'
      else 'You were removed from "' || v_name || '".'
    end
  );
  return old;
end;
$$;

create function private.notify_bookers_on_collection_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, message)
  select b.booked_by,
         'place_removed',
         'A place you booked, "' || coalesce(cp.custom_name, p.name) || '", was removed because "' || old.name || '" was deleted.'
  from public.collection_places as cp
  join public.bookings as b on b.place_id = cp.place_id
  join public.places as p on p.id = cp.place_id
  where cp.collection_id = old.id
    and b.booked_by <> old.owner_id;
  return old;
end;
$$;

-- ============================================================================ app functions

create function public.create_collection(p_name text, p_emoji text default '📌')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_collection_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a collection';
  end if;

  insert into public.collections (name, emoji, owner_id)
  values (p_name, p_emoji, v_user_id)
  returning id into v_collection_id;

  insert into public.collection_members (collection_id, user_id, role)
  values (v_collection_id, v_user_id, 'owner')
  on conflict (collection_id, user_id) do nothing;

  return v_collection_id;
end;
$$;

create function public.add_place_to_collection(
  p_collection_id uuid,
  p_name text,
  p_category text,
  p_lat double precision,
  p_lng double precision,
  p_address text default null,
  p_hours jsonb default null,
  p_phone text default null,
  p_booking_url text default null,
  p_reel_url text default null,
  p_maps_url text default null,
  p_website_url text default null,
  p_menu_url text default null,
  p_custom_info text default null,
  p_url text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_venue_id uuid;
  v_place_id uuid;
  v_user_id uuid := (select auth.uid());
  v_website_url text := nullif(btrim(p_website_url), '');
  v_menu_url text := nullif(btrim(p_menu_url), '');
begin
  if not private.is_collection_member(p_collection_id) then
    raise exception 'You are not a member of this collection';
  end if;

  if p_lat is not null and p_lng is not null then
    select v.id into v_venue_id
    from public.venues v
    where abs(v.lat - p_lat) < 0.00001 and abs(v.lng - p_lng) < 0.00001
    limit 1;

    if v_venue_id is null then
      insert into public.venues (name, address, lat, lng, hours, phone, booking_url, maps_url, website_url, menu_url)
      values (p_name, p_address, p_lat, p_lng, p_hours, p_phone, p_booking_url, p_maps_url, v_website_url, v_menu_url)
      returning id into v_venue_id;
    end if;
  end if;

  insert into public.places (venue_id, name, category, lat, lng, address, hours, phone, booking_url,
                             reel_url, maps_url, website_url, menu_url, custom_info, url,
                             created_at, updated_at)
  values (v_venue_id, p_name, p_category, p_lat, p_lng, p_address, p_hours, p_phone, p_booking_url,
          p_reel_url, p_maps_url, v_website_url, v_menu_url,
          nullif(btrim(p_custom_info), ''), nullif(btrim(p_url), ''),
          now(), now())
  returning id into v_place_id;

  insert into public.collection_places (collection_id, place_id, added_by, category, added_at)
  values (p_collection_id, v_place_id, v_user_id, p_category, now());

  return v_place_id;
end;
$$;

create function public.delete_place(p_collection_id uuid, p_place_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_owner boolean;
  v_is_locked boolean;
  v_added_by uuid;
  v_booked_by uuid;
  v_place_name text;
  v_collection_name text;
  v_remaining integer;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to delete a place';
  end if;

  if not private.is_collection_member(p_collection_id) then
    raise exception 'Place not found';
  end if;

  select cp.added_by into v_added_by
  from public.collection_places as cp
  where cp.collection_id = p_collection_id
    and cp.place_id = p_place_id;

  if not found then
    raise exception 'Place not found';
  end if;

  select c.is_locked, c.name into v_is_locked, v_collection_name
  from public.collections as c
  where c.id = p_collection_id;

  select p.name into v_place_name
  from public.places as p
  where p.id = p_place_id;

  v_is_owner := private.is_collection_owner(p_collection_id);

  select b.booked_by into v_booked_by
  from public.bookings as b
  where b.place_id = p_place_id;

  if not v_is_owner then
    if v_is_locked then
      raise exception 'This collection is locked';
    elsif v_booked_by is not null then
      raise exception 'Only the collection owner can delete a booked place';
    elsif v_added_by <> v_user_id then
      raise exception 'Only the collection owner or the person who added this place can delete it';
    end if;
  end if;

  delete from public.collection_places
  where collection_id = p_collection_id
    and place_id = p_place_id;

  if v_booked_by is not null and v_booked_by <> v_user_id then
    insert into public.notifications (user_id, type, message, collection_id)
    values (
      v_booked_by,
      'place_removed',
      'A place you booked, "' || v_place_name || '", was removed from "' || v_collection_name || '".',
      p_collection_id
    );
  end if;

  select count(*) into v_remaining
  from public.collection_places
  where place_id = p_place_id;

  if v_remaining = 0 then
    delete from public.reactions where place_id = p_place_id;
    delete from public.bookings where place_id = p_place_id;
    delete from public.places where id = p_place_id;
  end if;
end;
$$;

create function public.relocate_place(
  p_collection_id uuid,
  p_place_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_address text default null,
  p_name text default null,
  p_hours jsonb default null,
  p_phone text default null,
  p_booking_url text default null,
  p_maps_url text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_venue_id uuid;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Choose a place on the map first';
  end if;
  if not exists (
    select 1 from public.collection_places cp
    where cp.collection_id = p_collection_id and cp.place_id = p_place_id and cp.added_by = v_user_id
  ) then
    raise exception 'Only the person who added this place can change it' using errcode = '42501';
  end if;
  if not exists (select 1 from public.collections c where c.id = p_collection_id and c.owner_id = v_user_id)
     and not exists (
       select 1 from public.collection_members m
       where m.collection_id = p_collection_id and m.user_id = v_user_id and m.role in ('owner', 'editor')
     ) then
    raise exception 'Viewers can''t change places in this collection. Ask the owner to make you an editor.'
      using errcode = '42501';
  end if;

  select v.id into v_venue_id
  from public.venues v
  where abs(v.lat - p_lat) < 0.00001 and abs(v.lng - p_lng) < 0.00001
  limit 1;

  if v_venue_id is null then
    insert into public.venues (name, address, lat, lng, hours, phone, booking_url, maps_url)
    values (coalesce(nullif(btrim(p_name), ''), (select p.name from public.places p where p.id = p_place_id)),
            p_address, p_lat, p_lng, p_hours, p_phone, p_booking_url, p_maps_url)
    returning id into v_venue_id;
  end if;

  update public.collection_places
  set venue_id = v_venue_id,
      address = nullif(btrim(p_address), ''),
      lat = p_lat,
      lng = p_lng,
      hours = p_hours,
      phone = p_phone,
      booking_url = p_booking_url,
      maps_url = p_maps_url
  where collection_id = p_collection_id and place_id = p_place_id;

  if not exists (
    select 1 from public.collection_places cp
    where cp.place_id = p_place_id and cp.collection_id <> p_collection_id
  ) then
    update public.places
    set venue_id = v_venue_id,
        lat = p_lat,
        lng = p_lng,
        address = nullif(btrim(p_address), ''),
        hours = p_hours,
        phone = p_phone,
        booking_url = p_booking_url,
        website_url = null,
        subtitle = null,
        menu_url = null,
        menu = null,
        maps_url = p_maps_url,
        updated_at = now()
    where id = p_place_id;
  end if;

  return p_place_id;
end;
$$;

create function public.get_user_collections()
returns table (
  id uuid, name text, emoji text, is_private boolean, owner_id uuid, created_at timestamptz, collection_members jsonb
)
language sql stable security definer set search_path = '' as $$
  select
    c.id,
    c.name,
    c.emoji,
    c.is_private,
    c.owner_id,
    c.created_at,
    jsonb_agg(
      jsonb_build_object(
        'user_id', cm.user_id,
        'role', cm.role,
        'profile', jsonb_build_object(
          'id', p.id,
          'display_name', p.display_name,
          'avatar', p.avatar
        )
      )
    ) as collection_members
  from public.collections c
  left join public.collection_members cm on cm.collection_id = c.id
  left join public.profiles p on p.id = cm.user_id
  where
    c.owner_id = (select auth.uid())
    or exists (
      select 1 from public.collection_members m
      where m.collection_id = c.id and m.user_id = (select auth.uid())
    )
  group by c.id, c.name, c.emoji, c.is_private, c.owner_id, c.created_at
  order by c.created_at;
$$;

create function public.get_user_places()
returns table (
  id uuid, venue_id uuid, name text, category text, reel_url text, created_at timestamptz, address text,
  lat double precision, lng double precision, hours jsonb, phone text, booking_url text, website_url text,
  subtitle text, menu_url text, menu jsonb, maps_url text, custom_info text, url text,
  reactions jsonb, booking jsonb, collection_places jsonb
)
language sql stable security definer set search_path = '' as $$
  with my_collections as (
    select c.id from public.collections c where c.owner_id = (select auth.uid())
    union
    select m.collection_id from public.collection_members m where m.user_id = (select auth.uid())
  ),
  my_places as (
    select distinct cp.place_id
    from public.collection_places cp
    join my_collections mc on mc.id = cp.collection_id
  )
  select
    p.id,
    p.venue_id,
    p.name,
    p.category,
    p.reel_url,
    p.created_at,
    p.address,
    p.lat,
    p.lng,
    p.hours,
    p.phone,
    p.booking_url,
    p.website_url,
    p.subtitle,
    p.menu_url,
    p.menu,
    p.maps_url,
    p.custom_info,
    p.url,
    (select jsonb_object_agg(r.user_id, r.feeling)
       from public.reactions r where r.place_id = p.id) as reactions,
    (select jsonb_agg(b.* order by b.planned_at desc)
       from public.bookings b where b.place_id = p.id) as booking,
    (select jsonb_agg(
              jsonb_build_object(
                'collection_id', cp.collection_id,
                'added_by', cp.added_by,
                'added_at', cp.added_at
              ) order by cp.added_at)
       from public.collection_places cp where cp.place_id = p.id) as collection_places
  from public.places p
  join my_places mp on mp.place_id = p.id
  order by p.created_at;
$$;

create function public.get_streak(p_user_id uuid default auth.uid())
returns table (current_streak integer, best_streak integer)
language sql stable set search_path = '' as $$
  with today as (
    select (now() at time zone coalesce(
      (select pr.timezone from public.profiles as pr where pr.id = p_user_id),
      'UTC'
    ))::date as d
  ),
  grp as (
    select ad.day,
           ad.day - (row_number() over (order by ad.day))::int as island
    from public.activity_days as ad
    where ad.user_id = p_user_id
  ),
  runs as (
    select max(day) as end_day, count(*)::int as len
    from grp
    group by island
  )
  select
    coalesce((
      select r.len
      from runs as r, today as t
      where r.end_day >= t.d - 1
      order by r.end_day desc
      limit 1
    ), 0),
    coalesce((select max(len) from runs), 0);
$$;

create function public.set_collection_private(p_collection_id uuid, p_private boolean, p_confirm boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_owner_id uuid;
  v_others integer;
  r record;
  v_removed integer := 0;
begin
  select c.owner_id into v_owner_id
  from public.collections as c
  where c.id = p_collection_id;

  if not found then
    raise exception 'Collection not found';
  end if;

  if v_owner_id is distinct from (select auth.uid()) then
    raise exception 'Only the owner can change privacy';
  end if;

  select count(*) into v_others
  from public.collection_members as m
  where m.collection_id = p_collection_id
    and m.user_id <> v_owner_id;

  if p_private and v_others > 0 and not p_confirm then
    raise exception 'CONFIRM_REQUIRED:%', v_others;
  end if;

  update public.collections
  set is_private = p_private
  where id = p_collection_id;

  if p_private then
    for r in
      select m.user_id
      from public.collection_members as m
      where m.collection_id = p_collection_id
        and m.user_id <> v_owner_id
    loop
      delete from public.place_order
      where user_id = r.user_id and collection_id = p_collection_id;

      delete from public.collection_members
      where collection_id = p_collection_id and user_id = r.user_id;

      v_removed := v_removed + 1;
    end loop;

    delete from public.collection_invites
    where collection_id = p_collection_id;
  end if;

  return v_removed;
end;
$$;

create function public.set_member_role(p_collection_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if p_role not in ('editor', 'viewer') then
    raise exception 'A member can be an editor or a viewer';
  end if;
  if not exists (select 1 from public.collections c where c.id = p_collection_id and c.owner_id = v_user)
     and not exists (select 1 from public.collection_members m
       where m.collection_id = p_collection_id and m.user_id = v_user and m.role = 'owner') then
    raise exception 'Only the owner can change roles';
  end if;
  if exists (select 1 from public.collections c where c.id = p_collection_id and c.owner_id = p_user_id) then
    raise exception 'The owner''s role can''t be changed';
  end if;
  update public.collection_members m
    set role = p_role
    where m.collection_id = p_collection_id and m.user_id = p_user_id and m.role <> 'owner';
  if not found then
    raise exception 'That person isn''t in this collection';
  end if;
end;
$$;

create function public.transfer_collection_ownership(p_collection_id uuid, p_new_owner_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.collections as c
    where c.id = p_collection_id and c.owner_id = (select auth.uid())
  ) then
    raise exception 'You are not the owner of this collection';
  end if;

  if not exists (
    select 1 from public.collection_members as m
    where m.collection_id = p_collection_id and m.user_id = p_new_owner_id
  ) then
    raise exception 'User is not a member of this collection';
  end if;

  update public.collection_members
  set role = 'editor'
  where collection_id = p_collection_id and user_id = (select auth.uid());

  update public.collection_members
  set role = 'owner'
  where collection_id = p_collection_id and user_id = p_new_owner_id;

  update public.collections
  set owner_id = p_new_owner_id
  where id = p_collection_id;

  return true;
end;
$$;

create function public.create_collection_invite(p_collection_id uuid)
returns table (invite_id uuid, invite_code text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_user uuid := (select auth.uid());
  v_letters constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text;
  v_bytes bytea;
  v_byte integer;
  v_id uuid;
  v_has_invited_by boolean;
begin
  if v_user is null then
    raise exception 'You must sign in to share a collection';
  end if;
  if not exists (select 1 from public.collections c where c.id = p_collection_id and c.owner_id = v_user)
     and not exists (
       select 1 from public.collection_members m
       where m.collection_id = p_collection_id and m.user_id = v_user
     ) then
    raise exception 'Only people in this collection can invite others';
  end if;

  select i.id, i.code into v_id, v_code
    from public.collection_invites i
    where i.collection_id = p_collection_id
      and i.code ~ '^[A-Z0-9]{8}$'
      and i.expires_at > now() + interval '7 days'
    order by i.created_at desc
    limit 1;
  if v_id is not null then
    return query select v_id, v_code;
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collection_invites' and column_name = 'invited_by'
  ) into v_has_invited_by;

  for attempt in 1..5 loop
    v_code := '';
    while char_length(v_code) < 8 loop
      v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
      foreach v_byte in array array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15] loop
        exit when char_length(v_code) = 8;
        if get_byte(v_bytes, v_byte) < 248 then
          v_code := v_code || substr(v_letters, get_byte(v_bytes, v_byte) % 31 + 1, 1);
        end if;
      end loop;
    end loop;

    if exists (select 1 from public.collection_invites i where i.code = v_code) then
      continue;
    end if;

    if v_has_invited_by then
      execute 'insert into public.collection_invites (collection_id, code, invited_by, created_by, expires_at)
               values ($1, $2, $3, $3, now() + interval ''30 days'') returning id'
        into v_id using p_collection_id, v_code, v_user;
    else
      insert into public.collection_invites (collection_id, code, created_by, expires_at)
        values (p_collection_id, v_code, v_user, now() + interval '30 days')
        returning id into v_id;
    end if;
    return query select v_id, v_code;
    return;
  end loop;

  raise exception 'Couldn''t make an invite code. Try again.';
end;
$$;

create function public.accept_collection_invite(p_invite_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_collection_id uuid; v_expires_at timestamptz;
  v_role text := private.joining_member_role();
  v_inserted integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'You must sign in to accept an invite'; end if;
  select i.collection_id, i.expires_at into v_collection_id, v_expires_at
    from public.collection_invites i where i.id = p_invite_id for update;
  if not found or v_expires_at <= now() then raise exception 'Invalid or expired invite link'; end if;

  if v_role is null then
    insert into public.collection_members (collection_id, user_id)
      values (v_collection_id, (select auth.uid())) on conflict (collection_id, user_id) do nothing;
  else
    insert into public.collection_members (collection_id, user_id, role)
      values (v_collection_id, (select auth.uid()), v_role) on conflict (collection_id, user_id) do nothing;
  end if;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    update public.collection_invites set accepted_count = accepted_count + 1, last_used_at = now()
      where id = p_invite_id;
  end if;
  return v_inserted > 0;
end;
$$;

create function public.join_collection_by_code(p_code text)
returns table (collection_id uuid, collection_name text, joined boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_key text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_invite_id uuid; v_collection_id uuid;
  v_role text := private.joining_member_role();
  v_inserted integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'You must sign in to join a collection'; end if;
  if char_length(v_key) < 6 or char_length(v_key) > 64 then raise exception 'That code doesn''t look right'; end if;

  select i.id, i.collection_id into v_invite_id, v_collection_id from public.collection_invites i
    where upper(regexp_replace(i.code, '[^A-Za-z0-9]', '', 'g')) = v_key and i.expires_at > now()
    order by i.created_at desc limit 1 for update;
  if v_invite_id is null then raise exception 'That code is wrong or has expired'; end if;

  if v_role is null then
    insert into public.collection_members (collection_id, user_id)
      values (v_collection_id, (select auth.uid())) on conflict (collection_id, user_id) do nothing;
  else
    insert into public.collection_members (collection_id, user_id, role)
      values (v_collection_id, (select auth.uid()), v_role) on conflict (collection_id, user_id) do nothing;
  end if;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    update public.collection_invites set accepted_count = accepted_count + 1, last_used_at = now()
      where id = v_invite_id;
  end if;
  return query select c.id, c.name, v_inserted > 0 from public.collections c where c.id = v_collection_id;
end;
$$;

create function public.delete_user(p_cascade_delete boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'You must be signed in to delete your account';
  end if;
  if p_cascade_delete then
    delete from public.collections where owner_id = v_user_id;
  else
    delete from public.collection_members where user_id = v_user_id;
  end if;
  delete from public.place_order where user_id = v_user_id;
  delete from public.reactions where user_id = v_user_id;
  delete from public.bookings where booked_by = v_user_id;
  delete from public.collection_invites where created_by = v_user_id;
  delete from public.profiles where id = v_user_id;
  delete from auth.users where id = v_user_id;
  return true;
end;
$$;

-- A place's public details, for the shared page /p/:id.
create function public.shared_place(pid uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'category', p.category,
    'reel_url', p.reel_url,
    'address', p.address,
    'lat', p.lat,
    'lng', p.lng,
    'hours', p.hours,
    'phone', p.phone,
    'booking_url', p.booking_url,
    'website_url', p.website_url,
    'menu_url', p.menu_url,
    'subtitle', p.subtitle,
    'maps_url', p.maps_url
  )
  from public.places p
  where p.id = pid;
$$;

-- iPhone Shortcut: the key that identifies a person, and the reels it sends.
create function public.get_shortcut_key()
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

create function public.reset_shortcut_key()
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
    set key = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        created_at = now(),
        connected_at = null
  returning key into v_key;
  return v_key;
end;
$$;

create function public.mark_shortcut_connected(p_key text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  update public.shortcut_keys set connected_at = now() where key = btrim(coalesce(p_key, ''));
  if not found then
    raise exception 'Unknown shortcut key' using errcode = '28000';
  end if;
  return 'connected';
end;
$$;

create function public.save_shared_reel(p_key text, p_url text)
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

create function public.start_shared_reel_lookup(p_key text, p_url text)
returns void language sql security definer set search_path = '' as $$
  update public.shared_reels r
  set looking_since = now()
  from public.shortcut_keys k
  where k.key = btrim(coalesce(p_key, '')) and r.user_id = k.user_id and r.url = p_url and r.lookup is null;
$$;

-- The background lookup is done. Returns what happened:
--   'saved'       p_place was saved to TBD; the reel is removed and a notification made.
--   'needs_place' no clear match: p_lookup is kept for the app's Finish card.
--   'released'    the lookup failed (both null): the app looks the reel up itself when it opens.
--   'duplicate'   this reel is already saved; the reel is removed.
--   'taken'       the app already took the reel, so nothing is done.
create function public.finish_shared_reel(p_key text, p_url text, p_lookup jsonb, p_place jsonb default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_row uuid;
  v_collection uuid;
  v_place uuid;
  v_name text;
  v_category text;
  v_start date;
  v_end date;
begin
  select user_id into v_user from public.shortcut_keys where key = btrim(coalesce(p_key, ''));
  if v_user is null then
    return 'taken';
  end if;

  select id into v_row from public.shared_reels
  where user_id = v_user and url = p_url
  order by created_at desc limit 1
  for update;
  if v_row is null then
    return 'taken';
  end if;

  if p_place is null and p_lookup is null then
    update public.shared_reels set looking_since = null where id = v_row;
    return 'released';
  end if;

  v_name := left(coalesce(nullif(btrim(p_place ->> 'name'), ''), nullif(btrim(p_lookup ->> 'placeName'), ''), 'your reel'), 80);

  if p_place is null then
    update public.shared_reels set lookup = p_lookup, looking_since = null where id = v_row;
    insert into public.notifications (user_id, type, message)
    values (v_user, 'reel_needs_place', 'Pick the place for "' || v_name || '" to save it');
    return 'needs_place';
  end if;

  if exists (
    select 1 from public.places p
    join public.collection_places cp on cp.place_id = p.id
    where cp.added_by = v_user and p.reel_url = p_url
  ) then
    delete from public.shared_reels where id = v_row;
    return 'duplicate';
  end if;

  -- From here on this acts as the person, so create_collection(), add_place_to_collection() and the
  -- triggers on collection_places see them as the one adding the place (auth.uid()).
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select id into v_collection from public.collections
  where owner_id = v_user and is_inbox
  order by created_at limit 1;
  if v_collection is null then
    v_collection := public.create_collection('TBD', '📥');
    update public.collections set is_inbox = true where id = v_collection;
  end if;

  v_category := case when p_place ->> 'category' in ('cafe', 'food', 'event', 'other') then p_place ->> 'category' else 'food' end;
  v_place := public.add_place_to_collection(
    v_collection,
    v_name,
    v_category,
    (p_place ->> 'lat')::double precision,
    (p_place ->> 'lng')::double precision,
    nullif(btrim(p_place ->> 'address'), ''),
    case when jsonb_typeof(p_place -> 'hours') = 'array' and jsonb_array_length(p_place -> 'hours') > 0 then p_place -> 'hours' end,
    nullif(p_place ->> 'phone', ''),
    nullif(p_place ->> 'bookingUrl', ''),
    p_url,
    nullif(p_place ->> 'mapsUrl', ''),
    p_place ->> 'websiteUrl',
    p_place ->> 'menuUrl'
  );

  -- A pop-up is an event on its days.
  v_start := case when p_place ->> 'eventDate' ~ '^\d{4}-\d{2}-\d{2}$' then (p_place ->> 'eventDate')::date end;
  v_end := case when p_place ->> 'eventEndDate' ~ '^\d{4}-\d{2}-\d{2}$' then (p_place ->> 'eventEndDate')::date end;
  if v_category = 'event' and v_start is not null then
    update public.collection_places
    set event_date = v_start, event_end_date = case when v_end >= v_start then v_end end
    where collection_id = v_collection and place_id = v_place;
  end if;

  insert into public.reactions (collection_id, place_id, user_id, feeling)
  values (v_collection, v_place, v_user, 'keen')
  on conflict do nothing;

  delete from public.shared_reels where id = v_row;

  insert into public.notifications (user_id, type, message, collection_id)
  values (v_user, 'reel_saved',
          'Saved "' || v_name || '" to ' || (select c.name from public.collections c where c.id = v_collection),
          v_collection);
  return 'saved';
end;
$$;

-- Lookup rate limit: counts one call and says whether it is within the limit.
create function public.count_api_call(p_user_id uuid, p_endpoint text, p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_hour timestamptz := date_trunc('hour', now());
  v_calls integer;
begin
  delete from private.api_calls where user_id = p_user_id and hour < v_hour;
  insert into private.api_calls (user_id, endpoint, hour, calls)
  values (p_user_id, p_endpoint, v_hour, 1)
  on conflict (user_id, endpoint, hour) do update set calls = private.api_calls.calls + 1
  returning calls into v_calls;
  return v_calls <= p_limit;
end;
$$;

-- Booking files older than a day after the booking, for the clean-booking-files job.
create function public.expired_booking_files()
returns setof text language sql stable security definer set search_path = '' as $$
  select o.name
  from storage.objects o
  left join public.bookings b
    on split_part(o.name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
    and split_part(o.name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
    and b.collection_id = split_part(o.name, '/', 1)::uuid
    and b.place_id = split_part(o.name, '/', 2)::uuid
  where o.bucket_id = 'booking-files'
    and (
      (b.planned_at is not null and b.planned_at + interval '2 hours' + interval '1 day' < now())
      or (b.planned_at is null and o.created_at < now() - interval '2 days')
    )
  limit 1000;
$$;

-- ============================================================================ triggers

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger touch_profiles before update on public.profiles for each row execute function private.touch_updated_at();
create trigger touch_collections before update on public.collections for each row execute function private.touch_updated_at();
create trigger touch_places before update on public.places for each row execute function private.touch_updated_at();
create trigger touch_bookings before update on public.bookings for each row execute function private.touch_updated_at();

create trigger block_viewer_changes before insert or delete or update on public.collection_places
  for each row execute function private.block_viewer_changes();
create trigger block_viewer_changes before insert or delete or update on public.bookings
  for each row execute function private.block_viewer_changes();

create trigger cleanup_orphan_place after delete on public.collection_places for each row execute function private.cleanup_orphan_place();
create trigger fill_reaction_collection before insert on public.reactions for each row execute function private.fill_reaction_collection();

create trigger activity_collection_places after insert on public.collection_places for each row execute function private.activity_from_collection_places();
create trigger activity_reactions after insert or update on public.reactions for each row execute function private.activity_from_reactions();
create trigger activity_bookings after insert or update on public.bookings for each row execute function private.activity_from_bookings();

create trigger notify_place_added after insert on public.collection_places for each row execute function private.notify_place_added();
create trigger notify_place_reacted after insert on public.reactions for each row execute function private.notify_place_reacted();
create trigger notify_place_booked after insert on public.bookings for each row execute function private.notify_place_booked();
create trigger notify_place_done after update on public.bookings for each row execute function private.notify_place_done();
create trigger notify_collection_joined after insert on public.collection_members for each row execute function private.notify_collection_joined();
create trigger notify_collection_removed after delete on public.collection_members for each row execute function private.notify_collection_removed();
create trigger notify_bookers_on_collection_delete before delete on public.collections for each row execute function private.notify_bookers_on_collection_delete();

-- ============================================================================ row level security

alter table public.profiles enable row level security;
alter table public.venues enable row level security;
alter table public.places enable row level security;
alter table public.collections enable row level security;
alter table public.collection_members enable row level security;
alter table public.collection_places enable row level security;
alter table public.bookings enable row level security;
alter table public.reactions enable row level security;
alter table public.place_order enable row level security;
alter table public.collection_invites enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_days enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.shortcut_keys enable row level security;
alter table public.shared_reels enable row level security;
alter table public.reel_lookups enable row level security;
alter table public.place_lookups enable row level security;
alter table public.lookup_debug enable row level security;
alter table private.api_calls enable row level security;

create policy "activity: read own" on public.activity_days as permissive for select to authenticated
  using (user_id = (select auth.uid()));

create policy "bookings: members read" on public.bookings as permissive for select to authenticated
  using (private.is_collection_member(collection_id));
create policy "bookings: member books" on public.bookings as permissive for insert to authenticated
  with check (booked_by = (select auth.uid()) and private.is_collection_member(collection_id));
create policy "bookings: member updates" on public.bookings as permissive for update to authenticated
  using (private.is_place_member(place_id))
  with check (private.is_place_member(place_id) and (marked_by is null or marked_by = (select auth.uid())));

create policy "invites: read by inviter or members" on public.collection_invites as permissive for select to authenticated
  using (invited_by = (select auth.uid()) or private.is_collection_member(collection_id));
create policy "invites: inviter or owner deletes" on public.collection_invites as permissive for delete to authenticated
  using (invited_by = (select auth.uid()) or private.is_collection_owner(collection_id));
create policy "invites: members create" on public.collection_invites as permissive for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and private.is_collection_member(collection_id)
    and not exists (select 1 from public.collections c where c.id = collection_invites.collection_id and c.is_private)
  );

create policy "members: members read" on public.collection_members as permissive for select to authenticated
  using (user_id = (select auth.uid()) or private.is_collection_member(collection_id));
create policy "members: leave or owner removes" on public.collection_members as permissive for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_collection_owner(collection_id));

create policy "collection_places: members read" on public.collection_places as permissive for select to authenticated
  using (private.is_collection_member(collection_id));
create policy "collection_places: member adds" on public.collection_places as permissive for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and private.is_collection_member(collection_id)
    and (
      not exists (select 1 from public.collections c where c.id = collection_places.collection_id and c.is_locked)
      or private.is_collection_owner(collection_id)
    )
  );
create policy "collection_places: adder moves" on public.collection_places as permissive for update to authenticated
  using (added_by = (select auth.uid()) and private.is_collection_member(collection_id))
  with check (added_by = (select auth.uid()) and private.is_collection_member(collection_id));
create policy "collection_places: members edit unless locked" on public.collection_places as permissive for update to authenticated
  using (
    private.is_collection_member(collection_id)
    and (
      not exists (select 1 from public.collections c where c.id = collection_places.collection_id and c.is_locked)
      or private.is_collection_owner(collection_id)
    )
  )
  with check (
    private.is_collection_member(collection_id)
    and (
      not exists (select 1 from public.collections c where c.id = collection_places.collection_id and c.is_locked)
      or private.is_collection_owner(collection_id)
    )
  );

create policy "collections: members read" on public.collections as permissive for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_collection_member(id));
create policy "collections: create own" on public.collections as permissive for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "collections: owner updates" on public.collections as permissive for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "collections: owner deletes" on public.collections as permissive for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "notifications: own" on public.notifications as permissive for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "place_order: own rows" on public.place_order as permissive for all to authenticated
  using (user_id = (select auth.uid()) and private.is_collection_member(collection_id))
  with check (user_id = (select auth.uid()) and private.is_collection_member(collection_id));

create policy "places: read if in one of my collections" on public.places as permissive for select to authenticated
  using (exists (
    select 1 from public.collection_places cp
    where cp.place_id = places.id and private.is_collection_member(cp.collection_id)
  ));

create policy "profiles: read self and collection-mates" on public.profiles as permissive for select to authenticated
  using (id = (select auth.uid()) or private.shares_collection_with(id));
create policy "profiles: update self" on public.profiles as permissive for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "push_subscriptions: own rows" on public.push_subscriptions as permissive for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "reactions: members read" on public.reactions as permissive for select to authenticated
  using (private.is_collection_member(collection_id) or private.is_collection_owner(collection_id));
create policy "reactions: add own" on public.reactions as permissive for insert to authenticated
  with check (user_id = (select auth.uid()) and (private.is_collection_member(collection_id) or private.is_collection_owner(collection_id)));
create policy "reactions: change own" on public.reactions as permissive for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (private.is_collection_member(collection_id) or private.is_collection_owner(collection_id)));
create policy "reactions: remove own" on public.reactions as permissive for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users read their own shared reels" on public.shared_reels as permissive for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users delete their own shared reels" on public.shared_reels as permissive for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users read their own shortcut key" on public.shortcut_keys as permissive for select to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================================ storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('booking-files', 'booking-files', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']),
  ('profile-avatars', 'profile-avatars', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "profile avatars: user uploads own image" on storage.objects as permissive for insert to authenticated
  with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "profile avatars: user replaces own image" on storage.objects as permissive for update to authenticated
  using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "profile avatars: user deletes own image" on storage.objects as permissive for delete to authenticated
  using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "booking files: members upload" on storage.objects as permissive for insert to authenticated
  with check (bucket_id = 'booking-files' and private.is_booking_file_member(name));
create policy "booking files: members read" on storage.objects as permissive for select to authenticated
  using (bucket_id = 'booking-files' and private.is_booking_file_member(name));
create policy "booking files: uploader deletes" on storage.objects as permissive for delete to authenticated
  using (bucket_id = 'booking-files' and owner_id = (select auth.uid())::text);

-- ============================================================================ realtime
-- The app reloads its lists when these change (see REALTIME_TABLES in useAppData.js).
-- Live only published notifications, so lists never updated by themselves.

alter publication supabase_realtime add table
  public.collections,
  public.collection_members,
  public.places,
  public.reactions,
  public.bookings,
  public.collection_places,
  public.place_order,
  public.notifications;

-- ============================================================================ access
-- Signed-in people get the tables and functions the app uses (row level security decides which rows).
-- The lookup caches and logs are for the server (service key) only.

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant all on
  public.activity_days, public.bookings, public.collection_invites, public.collection_members,
  public.collection_places, public.collections, public.notifications, public.place_order, public.places,
  public.profiles, public.push_subscriptions, public.reactions, public.shared_reels, public.shortcut_keys,
  public.venues
to anon, authenticated;

revoke all on public.lookup_debug, public.place_lookups, public.reel_lookups from anon, authenticated;

revoke all on all functions in schema public from public, anon, authenticated;

-- Signed-in people
grant execute on function
  public.accept_collection_invite(uuid),
  public.add_place_to_collection(uuid, text, text, double precision, double precision, text, jsonb, text, text, text, text, text, text, text, text),
  public.create_collection(text, text),
  public.create_collection_invite(uuid),
  public.delete_user(boolean),
  public.get_shortcut_key(),
  public.get_user_collections(),
  public.get_user_places(),
  public.join_collection_by_code(text),
  public.relocate_place(uuid, uuid, double precision, double precision, text, text, jsonb, text, text, text),
  public.reset_shortcut_key(),
  public.set_member_role(uuid, uuid, text),
  public.transfer_collection_ownership(uuid, uuid)
to authenticated, service_role;

-- Anyone (the shared page /p/:id reads shared_place without signing in)
grant execute on function
  public.delete_place(uuid, uuid),
  public.get_streak(uuid),
  public.set_collection_private(uuid, boolean, boolean),
  public.shared_place(uuid)
to public, anon, authenticated, service_role;

-- The server only
grant execute on function
  public.count_api_call(uuid, text, integer),
  public.expired_booking_files(),
  public.finish_shared_reel(text, text, jsonb, jsonb),
  public.mark_shortcut_connected(text),
  public.save_shared_reel(text, text),
  public.start_shared_reel_lookup(text, text)
to service_role;
