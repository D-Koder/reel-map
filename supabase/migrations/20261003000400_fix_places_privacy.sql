-- Safely fetch only places from collections user owns or joined
create or replace function public.get_user_places()
returns table (
  id uuid,
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
  group by p.id, p.name, p.category, p.reel_url, p.reel_thumbnail_url, p.created_at, p.address, p.lat, p.lng, p.hours, p.phone, p.booking_url, p.website_url, p.subtitle, p.menu_url, p.menu, p.source, p.source_id
  order by p.created_at;
$$;

revoke all on function public.get_user_places() from public, anon;
grant execute on function public.get_user_places() to authenticated;
