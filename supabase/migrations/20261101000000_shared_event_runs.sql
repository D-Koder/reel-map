-- A reel saved in the background (the Shortcut) now keeps the event's days and times, not only its first and last
-- day. finish_shared_reel() takes the runs from p_place ->> 'eventRuns' (the same shape as collection_places.event_runs)
-- and saves them on the collection's entry. Everything else is unchanged from 20261025000000_notification_place_id.sql.

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

  -- A pop-up is an event on its days, with its times when the post gives them.
  v_start := case when p_place ->> 'eventDate' ~ '^\d{4}-\d{2}-\d{2}$' then (p_place ->> 'eventDate')::date end;
  v_end := case when p_place ->> 'eventEndDate' ~ '^\d{4}-\d{2}-\d{2}$' then (p_place ->> 'eventEndDate')::date end;
  if v_category = 'event' and v_start is not null then
    update public.collection_places
    set event_date = v_start,
        event_end_date = case when v_end >= v_start then v_end end,
        event_runs = case when jsonb_typeof(p_place -> 'eventRuns') = 'array' and jsonb_array_length(p_place -> 'eventRuns') > 0
          then p_place -> 'eventRuns' end
    where collection_id = v_collection and place_id = v_place;
  end if;

  insert into public.reactions (collection_id, place_id, user_id, feeling)
  values (v_collection, v_place, v_user, 'keen')
  on conflict do nothing;

  delete from public.shared_reels where id = v_row;

  insert into public.notifications (user_id, type, message, collection_id, place_id)
  values (v_user, 'reel_saved',
          'Saved "' || v_name || '" to ' || (select c.name from public.collections c where c.id = v_collection),
          v_collection, v_place);
  return 'saved';
end;
$$;
