-- Expired invite codes are removed a day after they expire, every day at 03:17 (and once now).
create or replace function public.remove_expired_invites()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from public.collection_invites where expires_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.remove_expired_invites() from public, anon, authenticated;
grant execute on function public.remove_expired_invites() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('remove-expired-invites', '17 3 * * *', 'select public.remove_expired_invites()');
  end if;
end;
$$;

select public.remove_expired_invites();
