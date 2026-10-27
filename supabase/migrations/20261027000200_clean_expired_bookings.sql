-- A plan nobody marked done is cleared a day after the visit would have ended (planned time + 2 hours of
-- event + 1 day), so the place goes back to being a normal place. A place marked done keeps its booking row as
-- the "been there" record; the app hides its plan details, and its confirmation files go the same day through
-- the clean-booking-files job (see expired_booking_files).
create or replace function public.clean_expired_bookings()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_deleted integer;
begin
  delete from public.bookings b
  where b.done_at is null
    and b.planned_at + interval '2 hours' + interval '1 day' < now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.clean_expired_bookings() from public, anon, authenticated;
grant execute on function public.clean_expired_bookings() to service_role;

-- Hourly, where pg_cron is available.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('clean-expired-bookings', '41 * * * *', 'select public.clean_expired_bookings()');
  end if;
end;
$$;
