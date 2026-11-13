-- Where each person is in the first-run tour: null = hasn't seen it, { done: true } = finished or skipped,
-- { step: ..., ... } = part way through (so it carries on where it left off, on any device).
-- Accounts that already exist are marked done, so only new accounts get the tour on their own.
alter table public.profiles add column if not exists tour jsonb;
update public.profiles set tour = jsonb_build_object('v', 1, 'done', true, 'skipped', true) where tour is null;
