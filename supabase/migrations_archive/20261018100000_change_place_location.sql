-- Change where a saved place is, without making a new one.
-- Before this, the only way to fix a wrong lookup was to add the place again, which left the old
-- one behind as a second place. The place keeps its id, so its votes, bookings, files and every
-- collection it's in stay with it, and the fix shows in all of them.
-- Only whoever added it to this collection can change it, and not in a collection they only view.
-- Details that belonged to the old spot (hours, phone, website, menu) are replaced by the new
-- spot's, or cleared when the new spot has none. Safe to run more than once.

create or replace function public.change_place_location(
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
returns void language plpgsql security definer set search_path = '' as $$
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
    insert into public.venues (name, address, lat, lng, hours, phone, booking_url, source, source_id)
    values (coalesce(nullif(btrim(p_name), ''), (select p.name from public.places p where p.id = p_place_id)),
            p_address, p_lat, p_lng, p_hours, p_phone, p_booking_url, p_source, p_source_id)
    returning id into v_venue_id;
  end if;

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
end;
$$;

revoke execute on function public.change_place_location(uuid, uuid, double precision, double precision, text, text, jsonb, text, text, text, text) from public, anon;
grant execute on function public.change_place_location(uuid, uuid, double precision, double precision, text, text, jsonb, text, text, text, text) to authenticated;
