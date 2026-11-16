-- Lookup traces: one row per reel lookup, so a wrong place can be followed back to the post, the caption
-- the AI read, what the AI answered, what was searched and which result was picked. Server only (no
-- policies), like lookup_debug. Kept 30 days (see the cleanup job at the end).

create table public.lookup_traces (
  id uuid primary key,
  created_at timestamptz not null default now(),
  -- The signed-in person. Shortcut lookups run in the background, so their user is filled in when the save finishes.
  user_id uuid,
  -- How the reel arrived: 'app' (pasted or shared in the app), 'inbox' (the reel inbox), 'shortcut' (iPhone Shortcut).
  entry text not null,
  reel_url text,
  clean_url text,
  from_cache boolean not null default false,
  -- When from_cache, the trace of the lookup that saved the answer.
  origin_trace_id uuid,
  cache_key text,
  caption text,
  creator text,
  location_tag text,
  -- The lookup's step log (the same steps the Add place log shows).
  steps jsonb not null default '{}'::jsonb,
  -- What the AI read and returned: model, raw reply text, parsed answer.
  ai jsonb,
  -- The search: query, candidates, the chosen one and why it was picked.
  search jsonb,
  -- The outcome: status, place name, details, whether it was saved.
  result jsonb not null default '{}'::jsonb,
  logs text,
  -- Reports from people ("wrong place"), each with its comment and time.
  reports jsonb not null default '[]'::jsonb
);

create index lookup_traces_reel_url_idx on public.lookup_traces (reel_url);
create index lookup_traces_clean_url_idx on public.lookup_traces (clean_url);
create index lookup_traces_created_at_idx on public.lookup_traces (created_at desc);
create index lookup_traces_user_id_idx on public.lookup_traces (user_id);

alter table public.lookup_traces enable row level security;
revoke all on public.lookup_traces from anon, authenticated;

-- Every place points at the lookup that found it.
alter table public.places
  add column lookup_trace_id uuid references public.lookup_traces (id) on delete set null;
create index places_lookup_trace_id_idx on public.places (lookup_trace_id);

-- When a place is added from the app, it is linked to this person's most recent lookup of the same reel
-- (within two hours, the time it takes to save). Shortcut saves are linked in finish_shared_reel below.
create or replace function public.link_place_to_lookup_trace()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_trace uuid;
begin
  if new.lookup_trace_id is null and new.reel_url is not null then
    select t.id into v_trace
    from public.lookup_traces t
    where t.user_id = (select auth.uid())
      and (t.reel_url = new.reel_url or t.clean_url = new.reel_url)
      and t.created_at > now() - interval '2 hours'
    order by t.created_at desc
    limit 1;
    new.lookup_trace_id := v_trace;
  end if;
  return new;
end;
$$;

create trigger places_link_lookup_trace
  before insert on public.places
  for each row execute function public.link_place_to_lookup_trace();

-- finish_shared_reel: as before, plus the Shortcut lookup's trace is linked to the new place (and its owner).
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
  v_trace uuid;
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

  -- The Shortcut lookup's trace belongs to this place and to this person.
  v_trace := nullif(p_place ->> 'traceId', '')::uuid;
  if v_trace is not null then
    update public.places set lookup_trace_id = v_trace where id = v_place;
    update public.lookup_traces set user_id = v_user where id = v_trace and user_id is null;
  end if;

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

-- Traces are kept 30 days, then deleted (a place keeps its place; only its trace link goes).
select cron.schedule('delete-old-lookup-traces', '23 4 * * *', $job$
  delete from public.lookup_traces where created_at < now() - interval '30 days';
$job$);
