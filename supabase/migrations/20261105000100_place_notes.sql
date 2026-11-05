-- A free-text note on a place, for this collection only (like its name and emoji).
alter table public.collection_places
  add column note text check (char_length(note) <= 500);
