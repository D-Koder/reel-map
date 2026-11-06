-- Cancel a booking: whoever made the plan, or an editor of the collection, can remove it.
-- The place stays; only the plan goes. (Viewers are already blocked by block_viewer_changes.)
create policy "bookings: planner or editor cancels" on public.bookings as permissive for delete to authenticated
  using (booked_by = (select auth.uid()) or private.can_edit_collection(collection_id));
