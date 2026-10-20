-- "Add all" on a list post saves each place straight away with its name, pin and address, then reads
-- its hours, phone, website and menu from Google Maps in the background. fill_place_details() writes
-- those onto the place once they arrive. Only the person who added the place to that collection can
-- fill it. Blank values never clear what's already there. Safe to run more than once.

create or replace function public.fill_place_details(
  p_collection_id uuid,
  p_place_id uuid,
  p_address text default null,
  p_hours jsonb default null,
  p_phone text default null,
  p_booking_url text default null,
  p_maps_url text default null,
  p_website_url text default null,
  p_menu_url text default null
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.collection_places cp
    where cp.collection_id = p_collection_id and cp.place_id = p_place_id and cp.added_by = (select auth.uid())
  ) then
    raise exception 'Only the person who added this place can change it' using errcode = '42501';
  end if;

  update public.places
  set address = coalesce(nullif(btrim(p_address), ''), address),
      hours = coalesce(case when jsonb_array_length(coalesce(p_hours, '[]'::jsonb)) > 0 then p_hours end, hours),
      phone = coalesce(nullif(btrim(p_phone), ''), phone),
      booking_url = coalesce(nullif(btrim(p_booking_url), ''), booking_url),
      maps_url = coalesce(nullif(btrim(p_maps_url), ''), maps_url),
      website_url = coalesce(nullif(btrim(p_website_url), ''), website_url),
      menu_url = coalesce(nullif(btrim(p_menu_url), ''), menu_url)
  where id = p_place_id;
end;
$$;

revoke execute on function public.fill_place_details(uuid, uuid, text, jsonb, text, text, text, text, text) from public, anon;
grant execute on function public.fill_place_details(uuid, uuid, text, jsonb, text, text, text, text, text) to authenticated;
