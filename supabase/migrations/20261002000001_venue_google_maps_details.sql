-- Add Google Maps enrichment fields recorded in the linked project's migration history.
alter table public.venues
  add column if not exists subtitle text,
  add column if not exists menu_url text,
  add column if not exists menu jsonb;
