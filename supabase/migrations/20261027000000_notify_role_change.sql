-- Tell a member when the owner changes their role (viewer ↔ editor).
create or replace function public.set_member_role(p_collection_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_old text;
begin
  if p_role not in ('editor', 'viewer') then
    raise exception 'A member can be an editor or a viewer';
  end if;
  if not exists (select 1 from public.collections c where c.id = p_collection_id and c.owner_id = v_user)
     and not exists (select 1 from public.collection_members m
       where m.collection_id = p_collection_id and m.user_id = v_user and m.role = 'owner') then
    raise exception 'Only the owner can change roles';
  end if;
  if exists (select 1 from public.collections c where c.id = p_collection_id and c.owner_id = p_user_id) then
    raise exception 'The owner''s role can''t be changed';
  end if;

  select m.role into v_old
  from public.collection_members m
  where m.collection_id = p_collection_id and m.user_id = p_user_id and m.role <> 'owner';
  if not found then
    raise exception 'That person isn''t in this collection';
  end if;

  update public.collection_members m
    set role = p_role
    where m.collection_id = p_collection_id and m.user_id = p_user_id;

  if v_old <> p_role then
    insert into public.notifications (user_id, type, message, collection_id)
    values (
      p_user_id,
      'role_changed',
      coalesce((select pr.display_name from public.profiles pr where pr.id = v_user), 'The owner')
        || case when p_role = 'editor'
             then ' made you an editor of "' || (select c.name from public.collections c where c.id = p_collection_id) || '": you can add and change places'
             else ' made you a viewer of "' || (select c.name from public.collections c where c.id = p_collection_id) || '": you can vote and copy places, not change them'
           end,
      p_collection_id
    );
  end if;
end;
$$;
