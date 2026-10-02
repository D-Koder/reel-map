create table public.collection_invites (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections (id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_count integer not null default 0 check (accepted_count >= 0),
  last_used_at timestamptz
);

create index collection_invites_collection_id_idx on public.collection_invites (collection_id);
create index collection_invites_created_by_idx on public.collection_invites (created_by);
create index collection_invites_expires_at_idx on public.collection_invites (expires_at);

alter table public.collection_invites enable row level security;

create policy "collection invites: creators read"
  on public.collection_invites for select to authenticated
  using (created_by = (select auth.uid()));

create policy "collection invites: collection owners create"
  on public.collection_invites for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.is_collection_owner(collection_id)
  );

create policy "collection invites: creators update"
  on public.collection_invites for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "collection invites: creators delete"
  on public.collection_invites for delete to authenticated
  using (created_by = (select auth.uid()));

create or replace function public.accept_collection_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_collection_id uuid;
  invite_expires_at timestamptz;
  inserted_count integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'You must sign in to accept an invite';
  end if;

  select i.collection_id, i.expires_at
    into invite_collection_id, invite_expires_at
    from public.collection_invites i
    where i.id = p_invite_id
    for update;

  if not found or invite_expires_at <= now() then
    raise exception 'Invalid or expired invite link';
  end if;

  insert into public.collection_members (collection_id, user_id, role)
    values (invite_collection_id, (select auth.uid()), 'member')
    on conflict (collection_id, user_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    update public.collection_invites
      set accepted_count = accepted_count + 1,
          last_used_at = now()
        where id = p_invite_id;
  end if;

  return inserted_count > 0;
end;
$$;

revoke all on function public.accept_collection_invite(uuid) from public, anon;
grant execute on function public.accept_collection_invite(uuid) to authenticated;