-- Join a collection by typing a short invite code (e.g. "K7Q2-XPMA") in Settings, as well as by link.
-- The app writes the code into collection_invites.code when it makes an invite.
-- Codes are matched without dashes, spaces or case. Safe to run more than once.

alter table public.collection_invites add column if not exists code text;

-- Lookups by code, ignoring dashes, spaces and case.
create index if not exists collection_invites_code_key_idx
  on public.collection_invites (upper(regexp_replace(code, '[^A-Za-z0-9]', '', 'g')));

create or replace function public.join_collection_by_code(p_code text)
returns table (collection_id uuid, collection_name text, joined boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_key text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_invite_id uuid;
  v_collection_id uuid;
  v_inserted integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'You must sign in to join a collection';
  end if;
  if char_length(v_key) < 6 or char_length(v_key) > 64 then
    raise exception 'That code doesn''t look right';
  end if;

  select i.id, i.collection_id
    into v_invite_id, v_collection_id
    from public.collection_invites i
    where upper(regexp_replace(i.code, '[^A-Za-z0-9]', '', 'g')) = v_key
      and i.expires_at > now()
    order by i.created_at desc
    limit 1
    for update;

  if v_invite_id is null then
    raise exception 'That code is wrong or has expired';
  end if;

  insert into public.collection_members (collection_id, user_id, role)
    values (v_collection_id, (select auth.uid()), 'member')
    on conflict (collection_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.collection_invites
      set accepted_count = accepted_count + 1, last_used_at = now()
      where id = v_invite_id;
  end if;

  return query
    select c.id, c.name, v_inserted > 0
    from public.collections c
    where c.id = v_collection_id;
end;
$$;

revoke all on function public.join_collection_by_code(text) from public, anon;
grant execute on function public.join_collection_by_code(text) to authenticated;
