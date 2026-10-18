-- Changing a place's location only changes it for this collection.
-- A place copied into other collections is shared by all of them, so moving it in place would move
-- it for everyone. When the place is in any other collection, this collection gets its own copy at
-- the new spot instead, and its votes, bookings and order move to the copy. The other collections
-- keep the original as it was. A place only in this collection is changed in place.
-- Returns the place's id in this collection afterwards: the same id, or the new copy's.
-- Booking files live at booking-files/<collection>/<place>/, so the app copies them across when the
-- id changes. Venues (shared spots) are never changed. Safe to run more than once.
-- It replaces change_place_location (which moved the place for everyone) under a new name, because
-- its return type changed. The old one is no longer callable from the app.

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
  p_source text default null,
  p_source_id text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := (select auth.uid());
  v_venue_id uuid;
  v_new_id uuid;
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
    insert into public.venues (name, address, lat, lng, hours, phone, booking_url, source, source_id)
    values (coalesce(nullif(btrim(p_name), ''), (select p.name from public.places p where p.id = p_place_id)),
            p_address, p_lat, p_lng, p_hours, p_phone, p_booking_url, p_source, p_source_id)
    returning id into v_venue_id;
  end if;

  -- Only this collection has it: change it in place.
  if not exists (
    select 1 from public.collection_places cp
    where cp.place_id = p_place_id and cp.collection_id <> p_collection_id
  ) then
    update public.places
    set venue_id = v_venue_id,
        name = coalesce(nullif(btrim(p_name), ''), name),
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
        source = p_source,
        source_id = p_source_id,
        updated_at = now()
    where id = p_place_id;
    return p_place_id;
  end if;

  -- Shared with other collections: this collection gets its own copy at the new spot.
  -- The reel, note and link come along; details of the old spot don't.
  insert into public.places (venue_id, name, category, lat, lng, address, hours, phone, booking_url,
                             reel_url, reel_thumbnail_url, source, source_id, custom_info, url,
                             created_at, updated_at)
  select v_venue_id, coalesce(nullif(btrim(p_name), ''), p.name), p.category, p_lat, p_lng,
         nullif(btrim(p_address), ''), p_hours, p_phone, p_booking_url,
         p.reel_url, p.reel_thumbnail_url, p_source, p_source_id, p.custom_info, p.url,
         p.created_at, now()
  from public.places p
  where p.id = p_place_id
  returning id into v_new_id;

  update public.collection_places set place_id = v_new_id
  where collection_id = p_collection_id and place_id = p_place_id;
  update public.reactions set place_id = v_new_id
  where collection_id = p_collection_id and place_id = p_place_id;
  update public.bookings set place_id = v_new_id
  where collection_id = p_collection_id and place_id = p_place_id;
  update public.place_order set place_id = v_new_id
  where collection_id = p_collection_id and place_id = p_place_id;

  return v_new_id;
end;
$$;

revoke execute on function public.relocate_place(uuid, uuid, double precision, double precision, text, text, jsonb, text, text, text, text) from public, anon;
grant execute on function public.relocate_place(uuid, uuid, double precision, double precision, text, text, jsonb, text, text, text, text) to authenticated;
revoke execute on function public.change_place_location(uuid, uuid, double precision, double precision, text, text, jsonb, text, text, text, text) from authenticated;

notify pgrst, 'reload schema';
