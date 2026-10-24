-- Move a place to another collection. Only whoever added it can move it, and only into a
-- collection they belong to. Copying needs no change: the existing insert rule already allows
-- an adder to add a place to any collection they are a member of.
drop policy if exists "collection_places: adder moves" on public.collection_places;
create policy "collection_places: adder moves"
  on public.collection_places for update to authenticated
  using (added_by = (select auth.uid()) and private.is_collection_member(collection_id))
  with check (added_by = (select auth.uid()) and private.is_collection_member(collection_id));
