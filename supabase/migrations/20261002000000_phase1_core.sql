-- Reel Map — phase 1: core schema, permissions (RLS) and helper functions.
--
-- Rules enforced here (not just in the UI):
--   * Collections are shared per collection via collection_members; private = owner only.
--   * You can only set your own vibe.
--   * Only whoever added a place (the reel sharer, or whoever saved a copy) can edit its name/category.
--   * Delete: booked place → only the booker; unbooked → only whoever added it. Soft delete, so it can be undone.
--   * One booking per place. Mark as Done once per place, not until an hour after the booking.
--   * Place order is per user.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.feeling as enum ('keen', 'maybe', 'meh');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar text not null default '🙂' check (char_length(avatar) between 1 and 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  emoji text not null default '📌' check (char_length(emoji) between 1 and 16),
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.collection_members (
  collection_id uuid not null references public.collections (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);

-- Real-world spot. Shared by every saved copy of it, so details live in one place.
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  hours jsonb, -- [{ "days": "Mon-Thu", "time": "5pm - 11pm" }, ...] — an array so order is kept
  phone text,
  booking_url text,
  source text, -- 'mapbox' | 'foursquare' | 'manual' (phase 3+)
  source_id text,
  created_at timestamptz not null default now()
);

-- A venue saved into a collection, with its reel, vibes, booking and visit.
create table public.places (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  venue_id uuid references public.venues (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  category text not null check (category in ('cafe', 'food', 'event')),
  reel_url text,
  reel_thumbnail_url text,
  shared_by uuid references public.profiles (id) on delete set null, -- credited as "Sent by"
  added_by uuid not null default auth.uid() references public.profiles (id) on delete cascade, -- can edit/delete
  copied_from uuid references public.places (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null
);

create table public.reactions (
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  feeling public.feeling not null,
  updated_at timestamptz not null default now(),
  primary key (place_id, user_id)
);

-- Primary key on place_id = one booking per place.
create table public.bookings (
  place_id uuid primary key references public.places (id) on delete cascade,
  booked_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  planned_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Primary key on place_id = marked done once for the whole place.
create table public.place_visits (
  place_id uuid primary key references public.places (id) on delete cascade,
  marked_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  done_at timestamptz not null default now()
);

-- Each person's own ordering of places within their lists.
create table public.place_order (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  position double precision not null,
  primary key (user_id, place_id)
);

-- Foreign-key / lookup indexes
create index on public.collections (owner_id);
create index on public.collection_members (user_id);
create index on public.places (collection_id);
create index on public.places (venue_id);
create index on public.places (shared_by);
create index on public.places (added_by);
create index on public.places (copied_from);
create index on public.places (deleted_by);
create index on public.reactions (user_id);
create index on public.bookings (booked_by);
create index on public.place_visits (marked_by);
create index on public.place_order (place_id);

-- ---------------------------------------------------------------------------
-- Private helpers (not exposed through the API; used by the policies below)
-- ---------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated;

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
    join public.collection_members m on m.collection_id = p.collection_id
    where p.id = pid and p.deleted_at is null and m.user_id = (select auth.uid())
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

grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Every account gets a profile, whether it signed up in the app or was created in the dashboard.
create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'New user'),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'avatar'), ''), '🙂')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Whoever creates a collection is its owner and first member.
create function private.add_collection_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.collection_members (collection_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger on_collection_created
  after insert on public.collections
  for each row execute function private.add_collection_owner();

-- Places: some columns are fixed once created, and only delete_place/restore_place may soft-delete.
create function private.guard_place_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.collection_id is distinct from old.collection_id
     or new.added_by is distinct from old.added_by
     or new.shared_by is distinct from old.shared_by
     or new.copied_from is distinct from old.copied_from
     or new.created_at is distinct from old.created_at then
    raise exception 'These details of a place can''t be changed';
  end if;
  if current_user in ('authenticated', 'anon')
     and (new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by) then
    raise exception 'Use delete_place / restore_place to delete or restore a place';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger guard_place_update
  before update on public.places
  for each row execute function private.guard_place_update();

create function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_profiles before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger touch_reactions before update on public.reactions
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.collections enable row level security;
alter table public.collection_members enable row level security;
alter table public.venues enable row level security;
alter table public.places enable row level security;
alter table public.reactions enable row level security;
alter table public.bookings enable row level security;
alter table public.place_visits enable row level security;
alter table public.place_order enable row level security;

-- profiles: see yourself and anyone you share a collection with; edit only yourself.
create policy "profiles: read self and collection-mates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_collection_with(id));
create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- collections: members read; owner creates/edits/deletes.
-- (owner_id check in select lets INSERT ... RETURNING work before the membership trigger has run.)
create policy "collections: members read" on public.collections
  for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_collection_member(id));
create policy "collections: create own" on public.collections
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "collections: owner updates" on public.collections
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "collections: owner deletes" on public.collections
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- collection_members: members see each other; you can leave; the owner can remove others.
-- Joining comes with invites in phase 2 (via a function), so there is no insert policy yet.
create policy "members: members read" on public.collection_members
  for select to authenticated
  using (private.is_collection_member(collection_id));
create policy "members: leave or owner removes" on public.collection_members
  for delete to authenticated
  using (
    (user_id = (select auth.uid()) and role <> 'owner')
    or (private.is_collection_owner(collection_id) and user_id <> (select auth.uid()))
  );

-- venues: public business info; any signed-in user can read and add. No edits from the app yet.
create policy "venues: read" on public.venues
  for select to authenticated using (true);
create policy "venues: add" on public.venues
  for insert to authenticated with check (true);

-- places: members read live places; you add places as yourself; only whoever added a place edits it.
create policy "places: members read" on public.places
  for select to authenticated
  using (deleted_at is null and private.is_collection_member(collection_id));
create policy "places: members add" on public.places
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and shared_by = (select auth.uid())
    and copied_from is null
    and deleted_at is null
    and private.is_collection_member(collection_id)
  );
create policy "places: adder edits" on public.places
  for update to authenticated
  using (added_by = (select auth.uid()) and deleted_at is null and private.is_collection_member(collection_id))
  with check (added_by = (select auth.uid()) and private.is_collection_member(collection_id));

-- reactions: members read everyone's; you only write your own.
create policy "reactions: members read" on public.reactions
  for select to authenticated
  using (private.is_place_member(place_id));
create policy "reactions: add own" on public.reactions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_place_member(place_id));
create policy "reactions: change own" on public.reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.is_place_member(place_id));
create policy "reactions: remove own" on public.reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- bookings: members read; anyone in the collection can book (as themselves); only the booker changes it.
create policy "bookings: members read" on public.bookings
  for select to authenticated
  using (private.is_place_member(place_id));
create policy "bookings: member books" on public.bookings
  for insert to authenticated
  with check (booked_by = (select auth.uid()) and private.is_place_member(place_id));
create policy "bookings: booker changes" on public.bookings
  for update to authenticated
  using (booked_by = (select auth.uid()))
  with check (booked_by = (select auth.uid()));
create policy "bookings: booker cancels" on public.bookings
  for delete to authenticated
  using (booked_by = (select auth.uid()));

-- place_visits: members read; any member marks done, but not before an hour after the booking.
create policy "visits: members read" on public.place_visits
  for select to authenticated
  using (private.is_place_member(place_id));
create policy "visits: member marks done" on public.place_visits
  for insert to authenticated
  with check (
    marked_by = (select auth.uid())
    and private.is_place_member(place_id)
    and not exists (
      select 1 from public.bookings b
      where b.place_id = place_visits.place_id and now() < b.planned_at + interval '1 hour'
    )
  );

-- place_order: entirely personal.
create policy "order: own rows" on public.place_order
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.is_place_member(place_id));

-- ---------------------------------------------------------------------------
-- API functions
-- ---------------------------------------------------------------------------

-- Soft-delete a place, applying the booker/adder rule.
create function public.delete_place(p_place_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_place public.places;
  v_booker uuid;
begin
  select * into v_place from public.places where id = p_place_id and deleted_at is null;
  if not found or not private.is_collection_member(v_place.collection_id) then
    raise exception 'Place not found';
  end if;

  select booked_by into v_booker from public.bookings where place_id = p_place_id;
  if v_booker is not null and v_booker <> (select auth.uid()) then
    raise exception 'Only the person who booked this place can delete it';
  elsif v_booker is null and v_place.added_by <> (select auth.uid()) then
    raise exception 'Only the person who shared this reel can delete it';
  end if;

  update public.places set deleted_at = now(), deleted_by = (select auth.uid()) where id = p_place_id;
end;
$$;

-- Undo a delete you made in the last day.
create function public.restore_place(p_place_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.places
  set deleted_at = null, deleted_by = null
  where id = p_place_id
    and deleted_by = (select auth.uid())
    and deleted_at > now() - interval '1 day';
  if not found then
    raise exception 'This place can no longer be restored';
  end if;
end;
$$;

revoke execute on function public.delete_place(uuid) from public, anon;
revoke execute on function public.restore_place(uuid) from public, anon;
grant execute on function public.delete_place(uuid) to authenticated;
grant execute on function public.restore_place(uuid) to authenticated;

-- One-tap sample data for a brand-new account. Runs as the caller, so every normal rule applies.
create function public.create_sample_data()
returns void language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  c_date uuid;
  c_events uuid;
  c_brunch uuid;
  v uuid;
  p uuid;
  next_sat_7pm timestamptz :=
    (date_trunc('day', now() at time zone 'Australia/Melbourne') + interval '2 days 19 hours')
      at time zone 'Australia/Melbourne';
begin
  if me is null then
    raise exception 'Sign in first';
  end if;
  if exists (select 1 from public.collections where owner_id = me) then
    raise exception 'You already have collections';
  end if;

  insert into public.collections (name, emoji) values ('Date Night', '📅') returning id into c_date;
  insert into public.collections (name, emoji) values ('Events', '🎉') returning id into c_events;
  insert into public.collections (name, emoji) values ('Brunch Spots', '☕') returning id into c_brunch;

  -- Wine & Wild (booked)
  insert into public.venues (name, address, lat, lng, hours, phone, booking_url, source)
  values ('Wine & Wild', 'Brunswick St, Fitzroy VIC', -37.7985, 144.9784,
    '[{"days":"Mon-Thu","time":"5pm - 11pm"},{"days":"Fri","time":"5pm - 12am"},{"days":"Sat","time":"12pm - 12am"},{"days":"Sun","time":"12pm - 10pm"}]',
    '(03) 9000 1234', 'https://www.opentable.com', 'manual')
  returning id into v;
  insert into public.places (collection_id, venue_id, name, category, reel_url, reel_thumbnail_url, shared_by)
  values (c_date, v, 'Wine & Wild', 'food', 'https://instagram.com/reels/abc123',
    'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=160&h=160&fit=crop', me)
  returning id into p;
  insert into public.reactions (place_id, feeling) values (p, 'keen');
  insert into public.bookings (place_id, planned_at) values (p, next_sat_7pm);

  -- Italian Bistro
  insert into public.venues (name, address, lat, lng, hours, source)
  values ('Italian Bistro', 'Lygon St, Carlton VIC', -37.7990, 144.9668,
    '[{"days":"Mon-Sun","time":"5pm - 10pm"}]', 'manual')
  returning id into v;
  insert into public.places (collection_id, venue_id, name, category, reel_url, shared_by)
  values (c_date, v, 'Italian Bistro', 'food', 'https://instagram.com/reels/mno345', me)
  returning id into p;
  insert into public.reactions (place_id, feeling) values (p, 'keen');

  -- Concert Next Week
  insert into public.venues (name, address, lat, lng, hours, booking_url, source)
  values ('Forum Melbourne', 'Flinders St, Melbourne VIC', -37.8164, 144.9696,
    '[{"days":"Thu","time":"7pm - 11pm"},{"days":"Fri","time":"7pm - 12am"},{"days":"Sat","time":"6pm - 12am"}]',
    'https://www.ticketmaster.com', 'manual')
  returning id into v;
  insert into public.places (collection_id, venue_id, name, category, reel_url, reel_thumbnail_url, shared_by)
  values (c_events, v, 'Concert Next Week', 'event', 'https://instagram.com/reels/def456',
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=160&h=160&fit=crop', me)
  returning id into p;
  insert into public.reactions (place_id, feeling) values (p, 'keen');

  -- Tech Festival
  insert into public.venues (name, address, lat, lng, hours, source)
  values ('Melbourne Convention Centre', 'South Wharf VIC', -37.8253, 144.9536,
    '[{"days":"Sat","time":"10am - 8pm"},{"days":"Sun","time":"10am - 6pm"}]', 'manual')
  returning id into v;
  insert into public.places (collection_id, venue_id, name, category, reel_url, shared_by)
  values (c_events, v, 'Tech Festival', 'event', 'https://instagram.com/reels/ghi789', me)
  returning id into p;
  insert into public.reactions (place_id, feeling) values (p, 'maybe');

  -- Brunch Spot Carlton
  insert into public.venues (name, address, lat, lng, hours, source)
  values ('Brunch Spot Carlton', 'Rathdowne St, Carlton VIC', -37.8001, 144.9711,
    '[{"days":"Mon-Fri","time":"7am - 3pm"},{"days":"Sat-Sun","time":"8am - 4pm"}]', 'manual')
  returning id into v;
  insert into public.places (collection_id, venue_id, name, category, reel_url, reel_thumbnail_url, shared_by)
  values (c_brunch, v, 'Brunch Spot Carlton', 'cafe', 'https://instagram.com/reels/jkl012',
    'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=160&h=160&fit=crop', me)
  returning id into p;
  insert into public.reactions (place_id, feeling) values (p, 'keen');

  -- Pancake House
  insert into public.venues (name, address, lat, lng, hours, source)
  values ('Pancake House', 'Collins St, Melbourne VIC', -37.8150, 144.9650,
    '[{"days":"Daily","time":"8am - 2pm"}]', 'manual')
  returning id into v;
  insert into public.places (collection_id, venue_id, name, category, reel_url, shared_by)
  values (c_brunch, v, 'Pancake House', 'cafe', 'https://instagram.com/reels/pqr678', me)
  returning id into p;
  insert into public.reactions (place_id, feeling) values (p, 'meh');
end;
$$;

revoke execute on function public.create_sample_data() from public, anon;
grant execute on function public.create_sample_data() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: open screens refresh when someone else changes something.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.collections,
  public.collection_members,
  public.places,
  public.reactions,
  public.bookings,
  public.place_visits;
