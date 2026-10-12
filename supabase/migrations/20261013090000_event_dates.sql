-- The day an event is on, per collection (like its name and category).
-- Home's "Up next" shows events coming up in the next three months.
-- Nullable, and only set for places in the event category.
alter table public.collection_places
  add column if not exists event_date date;
