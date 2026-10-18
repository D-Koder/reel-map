-- Trim columns nothing reads, and save the website and menu links so the place sheet can show them.
--
-- places:            drop reel_thumbnail_url and source; rename source_id to maps_url (it holds the Google Maps link).
-- venues:            same rename and drop; add website_url and menu_url so a venue keeps every detail of its location.
-- collection_places: drop position (each person's order lives in place_order).
-- reel_covers:       dropped (nothing reads or writes it).
--
-- add_place_to_collection(), get_user_places(), shared_place() and create_sample_data() are rebuilt to match.
-- Written for the live tables (see 20261014090100_faster_user_places.sql). Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'places' and column_name = 'source_id') then
    alter table public.places rename column source_id to maps_url;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'venues' and column_name = 'source_id') then
    alter table public.venues rename column source_id to maps_url;
  end if;
end;
$$;

alter table public.places
  drop column if exists reel_thumbnail_url,
  drop column if exists source;

alter table public.venues
  drop column if exists source,
  add column if not exists website_url text,
  add column if not exists menu_url text;

alter table public.collection_places
  drop column if exists position;

drop table if exists public.reel_covers;

-- ---------------------------------------------------------------------------
-- 2. add_place_to_collection(): no thumbnail or source; takes the Maps, website and menu links.
-- ---------------------------------------------------------------------------
drop function if exists public.add_place_to_collection(uuid, text, text, double precision, double precision, text, jsonb, text, text, text, text, text, text, text, text);

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

  insert into public.collection_places (collection_id, place_id, added_by, added_at)
  values (p_collection_id, v_place_id, v_user_id, now());

  return v_place_id;
end;
$$;

revoke execute on function public.add_place_to_collection(uuid, text, text, double precision, double precision, text, jsonb, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.add_place_to_collection(uuid, text, text, double precision, double precision, text, jsonb, text, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_user_places(): same as 20261014090100, minus the dropped columns.
-- ---------------------------------------------------------------------------
drop function if exists public.get_user_places();

create function public.get_user_places()
returns table (
  id uuid,
  venue_id uuid,
  name text,
  category text,
  reel_url text,
  created_at timestamptz,
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

revoke all on function public.get_user_places() from public, anon;
grant execute on function public.get_user_places() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. shared_place(): maps_url instead of source_id, no thumbnail.
-- ---------------------------------------------------------------------------
create or replace function public.shared_place(pid uuid)
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

revoke all on function public.shared_place(uuid) from public;
grant execute on function public.shared_place(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. create_sample_data(): the old calls passed a thumbnail, source and source id positionally,
--    which no longer line up. Same sample places, without those three.
-- ---------------------------------------------------------------------------
create or replace function public.create_sample_data()
returns void language plpgsql security invoker set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  c_date uuid;
  c_events uuid;
  c_brunch uuid;
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

  select public.add_place_to_collection(
    c_date, 'Wine & Wild', 'food', -37.7985, 144.9784,
    'Brunswick St, Fitzroy VIC',
    '[{"days":"Mon-Thu","time":"5pm - 11pm"},{"days":"Fri","time":"5pm - 12am"},{"days":"Sat","time":"12pm - 12am"},{"days":"Sun","time":"12pm - 10pm"}]',
    '(03) 9000 1234', 'https://www.opentable.com',
    'https://instagram.com/reels/abc123'
  ) into p;
  insert into public.reactions (place_id, user_id, feeling) values (p, me, 'keen');
  insert into public.bookings (place_id, booked_by, planned_at) values (p, me, next_sat_7pm);

  select public.add_place_to_collection(
    c_date, 'Italian Bistro', 'food', -37.7990, 144.9668,
    'Lygon St, Carlton VIC',
    '[{"days":"Mon-Sun","time":"5pm - 10pm"}]',
    null, null, 'https://instagram.com/reels/mno345'
  ) into p;
  insert into public.reactions (place_id, user_id, feeling) values (p, me, 'keen');

  select public.add_place_to_collection(
    c_events, 'Forum Melbourne', 'event', -37.8164, 144.9696,
    'Flinders St, Melbourne VIC',
    '[{"days":"Thu","time":"7pm - 11pm"},{"days":"Fri","time":"7pm - 12am"},{"days":"Sat","time":"6pm - 12am"}]',
    null, 'https://www.ticketmaster.com',
    'https://instagram.com/reels/def456'
  ) into p;
  insert into public.reactions (place_id, user_id, feeling) values (p, me, 'keen');

  select public.add_place_to_collection(
    c_events, 'Melbourne Convention Centre', 'event', -37.8253, 144.9536,
    'South Wharf VIC',
    '[{"days":"Sat","time":"10am - 8pm"},{"days":"Sun","time":"10am - 6pm"}]',
    null, null, 'https://instagram.com/reels/ghi789'
  ) into p;
  insert into public.reactions (place_id, user_id, feeling) values (p, me, 'maybe');

  select public.add_place_to_collection(
    c_brunch, 'Brunch Spot Carlton', 'cafe', -37.8001, 144.9711,
    'Rathdowne St, Carlton VIC',
    '[{"days":"Mon-Fri","time":"7am - 3pm"},{"days":"Sat-Sun","time":"8am - 4pm"}]',
    null, null, 'https://instagram.com/reels/jkl012'
  ) into p;
  insert into public.reactions (place_id, user_id, feeling) values (p, me, 'keen');

  select public.add_place_to_collection(
    c_brunch, 'Pancake House', 'cafe', -37.8150, 144.9650,
    'Collins St, Melbourne VIC',
    '[{"days":"Daily","time":"8am - 2pm"}]',
    null, null, 'https://instagram.com/reels/pqr678'
  ) into p;
  insert into public.reactions (place_id, user_id, feeling) values (p, me, 'meh');
end;
$$;

revoke execute on function public.create_sample_data() from public, anon;
grant execute on function public.create_sample_data() to authenticated;
