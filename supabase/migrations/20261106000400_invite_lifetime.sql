-- Invite codes last 7 days (was 30): a code that sits around is a smaller target. An existing code is reused while it
-- has more than a day left; after that the next Show makes a fresh one.
create or replace function public.create_collection_invite(p_collection_id uuid)
returns table (invite_id uuid, invite_code text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_user uuid := (select auth.uid());
  v_letters constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text;
  v_bytes bytea;
  v_byte integer;
  v_id uuid;
  v_has_invited_by boolean;
begin
  if v_user is null then
    raise exception 'You must sign in to share a collection';
  end if;
  if not exists (select 1 from public.collections c where c.id = p_collection_id and c.owner_id = v_user)
     and not exists (
       select 1 from public.collection_members m
       where m.collection_id = p_collection_id and m.user_id = v_user
     ) then
    raise exception 'Only people in this collection can invite others';
  end if;

  select i.id, i.code into v_id, v_code
    from public.collection_invites i
    where i.collection_id = p_collection_id
      and i.code ~ '^[A-Z0-9]{8}$'
      and i.expires_at > now() + interval '1 day'
    order by i.created_at desc
    limit 1;
  if v_id is not null then
    return query select v_id, v_code;
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collection_invites' and column_name = 'invited_by'
  ) into v_has_invited_by;

  for attempt in 1..5 loop
    v_code := '';
    while char_length(v_code) < 8 loop
      v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
      foreach v_byte in array array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15] loop
        exit when char_length(v_code) = 8;
        if get_byte(v_bytes, v_byte) < 248 then
          v_code := v_code || substr(v_letters, get_byte(v_bytes, v_byte) % 31 + 1, 1);
        end if;
      end loop;
    end loop;

    if exists (select 1 from public.collection_invites i where i.code = v_code) then
      continue;
    end if;

    if v_has_invited_by then
      execute 'insert into public.collection_invites (collection_id, code, invited_by, created_by, expires_at)
               values ($1, $2, $3, $3, now() + interval ''7 days'') returning id'
        into v_id using p_collection_id, v_code, v_user;
    else
      insert into public.collection_invites (collection_id, code, created_by, expires_at)
        values (p_collection_id, v_code, v_user, now() + interval '7 days')
        returning id into v_id;
    end if;
    return query select v_id, v_code;
    return;
  end loop;

  raise exception 'Couldn''t make an invite code. Try again.';
end;
$$;
