-- One notifications switch for the whole account: off silences pushes on every device (the push functions check it).
-- The in-app bell list is unaffected.
alter table public.profiles
  add column if not exists notifications_enabled boolean not null default true;
