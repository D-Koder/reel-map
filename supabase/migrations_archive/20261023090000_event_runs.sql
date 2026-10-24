-- When an event or pop-up is on, per collection: a list of runs, each
--   { "start": "2026-11-13", "end": "2026-11-15", "open": "11:00", "close": "22:00" }
-- open and close are optional 24 hour times; a run without them is on all day. An event can have several
-- runs (two weekends). event_date and event_end_date stay as the first and last day overall, so anything
-- that only reads those still works, and an event with no runs is one all-day run between them.
alter table public.collection_places
  add column if not exists event_runs jsonb;

alter table public.collection_places
  drop constraint if exists collection_places_event_runs_is_array;
alter table public.collection_places
  add constraint collection_places_event_runs_is_array
  check (event_runs is null or jsonb_typeof(event_runs) = 'array');

-- What it costs, as written ("Free", "$25", "$15-$40"), when someone gave it or the caption said.
alter table public.collection_places
  add column if not exists event_price text;

alter table public.collection_places
  drop constraint if exists collection_places_event_price_length;
alter table public.collection_places
  add constraint collection_places_event_price_length
  check (event_price is null or char_length(event_price) <= 60);
