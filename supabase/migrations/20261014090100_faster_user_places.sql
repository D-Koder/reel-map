-- get_user_places() joined reactions, bookings and collection_places in one go, so a place with
-- 3 reactions in 2 collections made 6 rows before grouping, and its collection list repeated
-- (one copy per reaction). Each list is now read on its own. Same columns and same results, minus
-- the repeats. Safe to run more than once.
--
-- Written for the live tables, which differ from older migrations here: places has no deleted_at,
-- lat/lng are double precision and menu is jsonb. The return type may change, so drop first.

drop function if exists public.get_user_places();

create function public.get_user_places()
returns table (
  id uuid,
  venue_id uuid,
  name text,
  category text,
  reel_url text,
  reel_thumbnail_url text,
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
    (select jsonb_object_agg(r.user_id, r.feeling)
       from public.reactions r where r.place_id = p.id) as reactions,
    (select jsonb_agg(b.* order by b.planned_at desc)
       from public.bookings b where b.place_id = p.id) as booking,
    (select jsonb_agg(
              jsonb_build_object(
                'collection_id', cp.collection_id,
                'added_by', cp.added_by,
                'added_at', cp.added_at,
                'position', cp.position
              ) order by cp.added_at)
       from public.collection_places cp where cp.place_id = p.id) as collection_places
  from public.places p
  join my_places mp on mp.place_id = p.id
  order by p.created_at;
$$;

revoke all on function public.get_user_places() from public, anon;
grant execute on function public.get_user_places() to authenticated;

-- Bookings are keyed by (collection_id, place_id), so looking them up by place alone needs its own index.
create index if not exists bookings_place_id_idx on public.bookings (place_id);
