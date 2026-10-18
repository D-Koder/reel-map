-- Brings the per-collection location (20261018120000_collection_place_location.sql) in line with
-- 20261019090000_trim_place_columns.sql, which dropped places.source and renamed source_id to maps_url.
--
-- collection_places: drop location_source; rename location_source_id to maps_url.
-- relocate_place():  takes p_maps_url instead of p_source / p_source_id, and writes the new columns.
-- change_place_location(): dropped. relocate_place replaced it and the app no longer calls it.
-- Safe to run more than once.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'collection_places' and column_name = 'location_source_id') then
    alter table public.collection_places rename column location_source_id to maps_url;
  end if;
end;
$$;

alter table public.collection_places
  drop column if exists location_source,
  add column if not exists maps_url text;

drop function if exists public.change_place_location(uuid, uuid, double precision, double precision, text, text, jsonb, text, text, text, text);
drop function if exists public.relocate_place(uuid, uuid, double precision, double precision, text, text, jsonb, text, text, text, text);

create or replace function public.relocate_place(
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
  -- Owner, or a member who is an editor (viewers can't change places).
  if not exists (select 1 from public.collections c where c.id = p_collection_id and c.owner_id = v_user_id)
     and not exists (
       select 1 from public.collection_members m
       where m.collection_id = p_collection_id and m.user_id = v_user_id and m.role in ('owner', 'editor')
     ) then
    raise exception 'Viewers can''t change places in this collection. Ask the owner to make you an editor.'
      using errcode = '42501';
  end if;

  -- Same as add_place_to_collection: reuse the venue at this spot (within ~1m), or create it.
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

  -- This collection's location.
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

  -- Nobody else has the place: its own location follows, so share links show the new spot.
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

revoke execute on function public.relocate_place(uuid, uuid, double precision, double precision, text, text, jsonb, text, text, text) from public, anon;
grant execute on function public.relocate_place(uuid, uuid, double precision, double precision, text, text, jsonb, text, text, text) to authenticated;

notify pgrst, 'reload schema';
