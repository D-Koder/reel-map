-- Each collection keeps its own name and category for a place, so a copy can be renamed
-- without changing the original. These columns already exist in production; this records them.
alter table public.collection_places
  add column if not exists custom_name text,
  add column if not exists category text;
