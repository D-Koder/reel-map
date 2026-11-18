-- Saves every place of a list post shared from the Shortcut, in one call. Each place is added to the
-- person's TBD (inbox) collection. A place already saved from the same reel with the same name is skipped.
-- Coordinates (lat, lng) must be looked up by the server for each place before this is called.

create or replace function public.finish_shared_reel_list(p_key text, p_url text, p_places jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_row uuid;
  v_collection uuid;
  v_place uuid;
  v_item jsonb;
  v_name text;
  v_category text;
  v_start date;
  v_end date;
  v_saved int := 0;
  v_skipped int := 0;
begin
  -- Same sign-in check as finish_shared_reel: the Shortcut key must belong to a person.
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

  if jsonb_typeof(p_places) is distinct from 'array' or jsonb_array_length(p_places) = 0 then
    return 'needs_place';
  end if;

  -- Act as the person, so the collection and place triggers see them as the one adding.
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select id into v_collection from public.collections
  where owner_id = v_user and is_inbox
  order by created_at limit 1;
  if v_collection is null then
    v_collection := public.create_collection('TBD', '📥');
    update public.collections set is_inbox = true where id = v_collection;
  end if;

  for v_item in select * from jsonb_array_elements(p_places) loop
    v_name := left(coalesce(nullif(btrim(v_item ->> 'name'), ''), 'your reel'), 80);

    -- Duplicate check: this person already saved a place with this name from this reel. Skip it.
    -- Other places from the same reel are still saved.
    if exists (
      select 1 from public.places p
      join public.collection_places cp on cp.place_id = p.id
      where cp.added_by = v_user
        and p.reel_url = p_url
        and lower(p.name) = lower(v_name)
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_category := case when v_item ->> 'category' in ('cafe', 'food', 'event', 'other')
      then v_item ->> 'category' else 'food' end;

    v_place := public.add_place_to_collection(
      v_collection,
      v_name,
      v_category,
      (v_item ->> 'lat')::double precision,
      (v_item ->> 'lng')::double precision,
      nullif(btrim(v_item ->> 'address'), ''),
      null,                                  -- hours
      null,                                  -- phone
      null,                                  -- booking url
      p_url,
      nullif(v_item ->> 'mapsUrl', ''),
      null,                                  -- website
      null                                   -- menu
    );

    -- Pop-up dates, when the post gives them (same rule as finish_shared_reel).
    v_start := case when v_item ->> 'startDate' ~ '^\d{4}-\d{2}-\d{2}$' then (v_item ->> 'startDate')::date end;
    v_end := case when v_item ->> 'endDate' ~ '^\d{4}-\d{2}-\d{2}$' then (v_item ->> 'endDate')::date end;
    if v_category = 'event' and v_start is not null then
      update public.collection_places
      set event_date = v_start,
          event_end_date = case when v_end >= v_start then v_end end
      where collection_id = v_collection and place_id = v_place;
    end if;

    insert into public.reactions (collection_id, place_id, user_id, feeling)
    values (v_collection, v_place, v_user, 'keen')
    on conflict do nothing;

    v_saved := v_saved + 1;
  end loop;

  delete from public.shared_reels where id = v_row;

  insert into public.notifications (user_id, type, message)
  values (v_user, 'reel_saved',
          'Saved ' || v_saved || ' place(s) to TBD' ||
          case when v_skipped > 0 then ', skipped ' || v_skipped || ' already saved' else '' end);

  return 'saved';
end;
$$;
