-- add_place_to_collection(): also saves the category on the collection's entry.
-- collection_places.category is required (not null), but 20261019090000_trim_place_columns.sql rebuilt
-- this function without it, so every add failed with
-- 'null value in column "category" of relation "collection_places" violates not-null constraint'.
-- Same arguments as before, so the app needs no change. Safe to run more than once.

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

  insert into public.collection_places (collection_id, place_id, added_by, category, added_at)
  values (p_collection_id, v_place_id, v_user_id, p_category, now());

  return v_place_id;
end;
$$;
