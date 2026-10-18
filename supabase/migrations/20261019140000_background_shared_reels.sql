-- Reels shared from the iPhone Shortcut are now finished while the app is closed (see api/save-reel.js):
--   1. start_shared_reel_lookup() marks the reel as being looked up, so the app waits for it.
--   2. finish_shared_reel() either saves the place to the person's TBD collection (a clear match), or
--      keeps the lookup on the reel so the app opens straight to "pick the place". Both send a push.
-- Only the server (service role) can call them. Safe to run more than once.

alter table public.shared_reels
  add column if not exists looking_since timestamptz,
  add column if not exists lookup jsonb;

-- The reel is being looked up now. p_url is the link as save_shared_reel() stored it.
create or replace function public.start_shared_reel_lookup(p_key text, p_url text)
returns void language sql security definer set search_path = '' as $$
  update public.shared_reels r
  set looking_since = now()
  from public.shortcut_keys k
  where k.key = btrim(coalesce(p_key, '')) and r.user_id = k.user_id and r.url = p_url and r.lookup is null;
$$;

-- The background lookup is done. Returns what happened:
--   'saved'       p_place was saved to TBD; the reel is removed and a push sent.
--   'needs_place' no clear match: p_lookup is kept for the app's Finish card, and a push sent.
--   'released'    the lookup failed (both null): the app looks the reel up itself when it opens.
--   'duplicate'   this reel is already saved; the reel is removed.
--   'taken'       the app already took the reel, so nothing is done.
-- p_place: { name, address, category, lat, lng, hours, phone, bookingUrl, mapsUrl, websiteUrl, menuUrl,
--            eventDate, eventEndDate }, as the app's reel inbox would save it.
create or replace function public.finish_shared_reel(p_key text, p_url text, p_lookup jsonb, p_place jsonb default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_row uuid;
  v_collection uuid;
  v_place uuid;
  v_name text;
  v_category text;
  v_start date;
  v_end date;
begin
  select user_id into v_user from public.shortcut_keys where key = btrim(coalesce(p_key, ''));
  if v_user is null then
    return 'taken';
  end if;

  select id into v_row from public.shared_reels
  where user_id = v_user and url = p_url
  order by created_at desc limit 1
  for update;
  if v_row is null then
    return 'taken';
  end if;

  if p_place is null and p_lookup is null then
    update public.shared_reels set looking_since = null where id = v_row;
    return 'released';
  end if;

  v_name := left(coalesce(nullif(btrim(p_place ->> 'name'), ''), nullif(btrim(p_lookup ->> 'placeName'), ''), 'your reel'), 80);

  if p_place is null then
    update public.shared_reels set lookup = p_lookup, looking_since = null where id = v_row;
    insert into public.notifications (user_id, type, message)
    values (v_user, 'reel_needs_place', 'Pick the place for "' || v_name || '" to save it');
    return 'needs_place';
  end if;

  if exists (
    select 1 from public.places p
    join public.collection_places cp on cp.place_id = p.id
    where cp.added_by = v_user and p.reel_url = p_url
  ) then
    delete from public.shared_reels where id = v_row;
    return 'duplicate';
  end if;

  -- From here on this acts as the person, so create_collection(), add_place_to_collection() and the
  -- triggers on collection_places see them as the one adding the place (auth.uid()).
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select id into v_collection from public.collections
  where owner_id = v_user and is_inbox
  order by created_at limit 1;
  if v_collection is null then
    v_collection := public.create_collection('TBD', '📥');
    update public.collections set is_inbox = true where id = v_collection;
  end if;

  v_category := case when p_place ->> 'category' in ('cafe', 'food', 'event', 'other') then p_place ->> 'category' else 'food' end;
  v_place := public.add_place_to_collection(
    v_collection,
    v_name,
    v_category,
    (p_place ->> 'lat')::double precision,
    (p_place ->> 'lng')::double precision,
    nullif(btrim(p_place ->> 'address'), ''),
    case when jsonb_typeof(p_place -> 'hours') = 'array' and jsonb_array_length(p_place -> 'hours') > 0 then p_place -> 'hours' end,
    nullif(p_place ->> 'phone', ''),
    nullif(p_place ->> 'bookingUrl', ''),
    p_url,
    nullif(p_place ->> 'mapsUrl', ''),
    p_place ->> 'websiteUrl',
    p_place ->> 'menuUrl'
  );

  -- A pop-up is an event on its days.
  v_start := case when p_place ->> 'eventDate' ~ '^\d{4}-\d{2}-\d{2}$' then (p_place ->> 'eventDate')::date end;
  v_end := case when p_place ->> 'eventEndDate' ~ '^\d{4}-\d{2}-\d{2}$' then (p_place ->> 'eventEndDate')::date end;
  if v_category = 'event' and v_start is not null then
    update public.collection_places
    set event_date = v_start, event_end_date = case when v_end >= v_start then v_end end
    where collection_id = v_collection and place_id = v_place;
  end if;

  -- Sharing a reel means you're keen on it.
  insert into public.reactions (collection_id, place_id, user_id, feeling)
  values (v_collection, v_place, v_user, 'keen')
  on conflict do nothing;

  delete from public.shared_reels where id = v_row;

  insert into public.notifications (user_id, type, message, collection_id)
  values (v_user, 'reel_saved',
          'Saved "' || v_name || '" to ' || (select c.name from public.collections c where c.id = v_collection),
          v_collection);
  return 'saved';
end;
$$;

revoke execute on function public.start_shared_reel_lookup(text, text) from public, anon, authenticated;
revoke execute on function public.finish_shared_reel(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.start_shared_reel_lookup(text, text) to service_role;
grant execute on function public.finish_shared_reel(text, text, jsonb, jsonb) to service_role;
