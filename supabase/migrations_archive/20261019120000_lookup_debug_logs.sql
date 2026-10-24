-- lookup_debug.logs: everything a lookup ran, to look back at when a place was missed.
--   Shared posts: the lookup's steps, then every server console line (e.g. "spawn ETXTBSY").
--   "Report this lookup" in the app: the log the app showed.
-- Safe to run more than once.

alter table public.lookup_debug
  add column if not exists logs text;
