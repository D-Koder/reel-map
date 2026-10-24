-- My order for collections on Home and in Settings, as a list of collection ids.
-- Collections not in the list (new or just joined) show after, in their usual order.
-- Each person updates only their own profile row, which the existing policy already allows.
alter table public.profiles
  add column if not exists collection_order uuid[];
