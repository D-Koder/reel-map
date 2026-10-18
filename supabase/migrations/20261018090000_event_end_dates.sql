-- The last day an event or pop-up is on, per collection (like event_date).
-- Null means a one-day event: it ends on event_date.
-- Home's "Today" shows an event on every day from event_date to event_end_date.
alter table public.collection_places
  add column if not exists event_end_date date;

-- An event can't end before it starts.
alter table public.collection_places
  drop constraint if exists collection_places_event_end_after_start;
alter table public.collection_places
  add constraint collection_places_event_end_after_start
  check (event_end_date is null or event_date is null or event_end_date >= event_date);
