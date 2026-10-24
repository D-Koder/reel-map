-- One-off changes that bring the LIVE project in line with supabase/migrations (run once, in the SQL editor).
-- A new project built from the baseline already has all of this.

-- 1. Live only publishes `notifications` to realtime, so the app never hears about changes to places,
--    collections and so on, and its lists stay stale until it is reopened.
alter publication supabase_realtime add table
  public.collections,
  public.collection_members,
  public.places,
  public.reactions,
  public.bookings,
  public.collection_places,
  public.place_order;

-- 2. Leftover functions that no longer work (they use columns that were removed). The app only calls the
--    two-argument delete_place; create_sample_data is not used.
drop function if exists public.delete_place(uuid);
drop function if exists public.restore_place(uuid);
drop function if exists public.create_sample_data();

-- 3. Duplicate indexes (each repeats another index on the same columns).
drop index if exists public.idx_bookings_booked_by;
drop index if exists public.idx_bookings_marked_by;
drop index if exists public.idx_collection_invites_code;
drop index if exists public.idx_collection_invites_collection_id;
drop index if exists public.idx_collection_invites_invited_by;
drop index if exists public.idx_collection_members_user_id;
drop index if exists public.idx_collection_places_added_by;
drop index if exists public.idx_collection_places_collection_id;
drop index if exists public.idx_collection_places_copied_from;
drop index if exists public.idx_collection_places_place_id;
drop index if exists public.idx_collection_places_shared_by;
drop index if exists public.idx_collections_owner_id;
drop index if exists public.idx_place_order_place;
drop index if exists public.idx_reactions_user_id;

-- 4. The hourly counters table had row level security off.
alter table private.api_calls enable row level security;
