-- Venues and entries.
-- A venue is one real-world location (shared by everyone who saves it).
-- An entry (a row in places) is one thing saved at that location, with its own
-- custom info (e.g. "Pottery class") and link. Several entries can share a venue.

-- ---------------------------------------------------------------------------
-- 1. Venues: one row per location. Created on demand by add_place_to_collection.
-- ---------------------------------------------------------------------------
create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  hours jsonb,
  phone text,
  booking_url text,
  source text,
  source_id text,
  created_at timestamptz not null default now()
);

-- No policies: the app never reads or writes venues directly. The security-definer
-- functions below do, and get_user_places() returns the venue fields it needs.
alter table public.venues enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Entries: custom info and link per saved item.
-- ---------------------------------------------------------------------------
alter table public.places
  add column if not exists venue_id uuid references public.venues (id) on delete set null,
  add column if not exists custom_info text check (char_length(custom_info) <= 120),
  add column if not exists url text;

create index if not exists places_venue_id_idx on public.places (venue_id);

-- ---------------------------------------------------------------------------
-- 3. Backfill: give existing located places a venue. Places at the same spot share one.
-- ---------------------------------------------------------------------------
insert into public.venues (name, address, lat, lng, hours, phone, booking_url, source, source_id)
select distinct on (p.lat, p.lng)
  p.name, p.address, p.lat, p.lng, p.hours, p.phone, p.booking_url, p.source, p.source_id
from public.places p
where p.lat is not null and p.lng is not null and p.venue_id is null
  and not exists (
    select 1 from public.venues v
    where abs(v.lat - p.lat) < 0.00001 and abs(v.lng - p.lng) < 0.00001
  )
order by p.lat, p.lng, p.created_at;

update public.places p
set venue_id = v.id
from public.venues v
where p.venue_id is null
  and p.lat is not null and p.lng is not null
  and abs(v.lat - p.lat) < 0.00001 and abs(v.lng - p.lng) < 0.00001;

-- ---------------------------------------------------------------------------
-- 4. add_place_to_collection: always creates a new entry.
--    The venue is reused when the location already exists. The duplicate warning
--    is shown in the app before this runs, so the database doesn't block it.
-- ---------------------------------------------------------------------------
drop function if exists public.add_place_to_collection(uuid, text, text, double precision, double precision, text, jsonb, text, text, text, text, text, text);

create or replace function public.add_place_to_collection(
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
  p_reel_thumbnail_url text default null,
  p_source text default null,
  p_source_id text default null,
  p_custom_info text default null,
  p_url text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_venue_id uuid;
  v_place_id uuid;
  v_user_id uuid := (select auth.uid());
begin
  if not private.is_collection_member(p_collection_id) then
    raise exception 'You are not a member of this collection';
  end if;

  -- Reuse the venue for this location, or create it (within ~1m).
  if p_lat is not null and p_lng is not null then
    select v.id into v_venue_id
    from public.venues v
    where abs(v.lat - p_lat) < 0.00001 and abs(v.lng - p_lng) < 0.00001
    limit 1;

    if v_venue_id is null then
      insert into public.venues (name, address, lat, lng, hours, phone, booking_url, source, source_id)
      values (p_name, p_address, p_lat, p_lng, p_hours, p_phone, p_booking_url, p_source, p_source_id)
      returning id into v_venue_id;
    end if;
  end if;

  -- Always a new entry, even when the venue already has entries.
  insert into public.places (venue_id, name, category, lat, lng, address, hours, phone, booking_url,
                             reel_url, reel_thumbnail_url, source, source_id, custom_info, url,
                             created_at, updated_at)
  values (v_venue_id, p_name, p_category, p_lat, p_lng, p_address, p_hours, p_phone, p_booking_url,
          p_reel_url, p_reel_thumbnail_url, p_source, p_source_id,
          nullif(btrim(p_custom_info), ''), nullif(btrim(p_url), ''),
          now(), now())
  returning id into v_place_id;

  insert into public.collection_places (collection_id, place_id, added_by, added_at)
  values (p_collection_id, v_place_id, v_user_id, now());

  return v_place_id;
end;
$$;

revoke execute on function public.add_place_to_collection(uuid, text, text, double precision, double precision, text, jsonb, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.add_place_to_collection(uuid, text, text, double precision, double precision, text, jsonb, text, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. get_user_places: adds venue_id, custom_info and url (return type changes, so drop first).
-- ---------------------------------------------------------------------------
drop function if exists public.get_user_places();

create or replace function public.get_user_places()
returns table (
  id uuid,
  venue_id uuid,
  name text,
  category text,
  reel_url text,
  reel_thumbnail_url text,
  created_at timestamptz,
  address text,
  lat numeric,
  lng numeric,
  hours jsonb,
  phone text,
  booking_url text,
  website_url text,
  subtitle text,
  menu_url text,
  menu text,
  source text,
  source_id text,
  custom_info text,
  url text,
  reactions jsonb,
  booking jsonb,
  collection_places jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.venue_id,
    p.name,
    p.category,
    p.reel_url,
    p.reel_thumbnail_url,
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
    p.source,
    p.source_id,
    p.custom_info,
    p.url,
    jsonb_object_agg(r.user_id, r.feeling) filter (where r.user_id is not null) as reactions,
    jsonb_agg(b.* order by b.planned_at desc) filter (where b.booked_by is not null) as booking,
    jsonb_agg(
      jsonb_build_object(
        'collection_id', cp.collection_id,
        'added_by', cp.added_by,
        'added_at', cp.added_at,
        'position', cp.position
      ) order by cp.added_at
    ) filter (where cp.collection_id is not null) as collection_places
  from public.places p
  left join public.reactions r on r.place_id = p.id
  left join public.bookings b on b.place_id = p.id
  left join public.collection_places cp on cp.place_id = p.id
  where
    p.deleted_at is null
    and exists (
      select 1 from public.collection_places cp2
      join public.collections c on c.id = cp2.collection_id
      where cp2.place_id = p.id
      and (
        c.owner_id = (select auth.uid())
        or exists (
          select 1 from public.collection_members m
          where m.collection_id = c.id and m.user_id = (select auth.uid())
        )
      )
    )
  group by p.id, p.venue_id, p.name, p.category, p.reel_url, p.reel_thumbnail_url, p.created_at, p.address,
           p.lat, p.lng, p.hours, p.phone, p.booking_url, p.website_url, p.subtitle, p.menu_url, p.menu,
           p.source, p.source_id, p.custom_info, p.url
  order by p.created_at;
$$;

revoke all on function public.get_user_places() from public, anon;
grant execute on function public.get_user_places() to authenticated;

-- 6. Entries at one location can share a Google place (source, source_id), so drop the
--    one-per-place rule. The venue keeps the source details.
alter table public.places drop constraint if exists places_source_unique;
drop index if exists public.places_source_unique;
