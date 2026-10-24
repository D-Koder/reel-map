-- The parts of the database that call this project's own address: push notifications and the scheduled jobs.
-- Live is project bxkiuaapyiflnmqhodgm. For another project (staging, test), replace every
-- bxkiuaapyiflnmqhodgm below with that project's ref (the part before .supabase.co) before running.
--
-- It also needs a secret named push_secret in Vault (Dashboard > Project Settings > Vault), the same value
-- the push-notification and send-friday-pick edge functions check. Without it the jobs still run but the
-- edge functions answer 401.

-- Every new notification is also sent as a push to the person's phone.
create function private.push_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://bxkiuaapyiflnmqhodgm.supabase.co/functions/v1/push-notification',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('user_id', new.user_id, 'type', new.type, 'message', new.message)
  );
  return new;
end;
$$;

create trigger push_notification after insert on public.notifications
  for each row execute function private.push_notification();

-- Hourly: remove booking files a day after the booking.
select cron.schedule('clean-booking-files', '17 * * * *', $job$
  select net.http_post(
    url := 'https://bxkiuaapyiflnmqhodgm.supabase.co/functions/v1/clean-booking-files',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
$job$);

-- Daily: drop lookup caches older than 100 days.
select cron.schedule('cleanup-lookups', '17 3 * * *', $job$
  delete from public.reel_lookups  where updated_at < now() - interval '100 days';
  delete from public.place_lookups where updated_at < now() - interval '100 days';
$job$);

-- Fridays 9:00 (UTC): the weekly pick notification.
select cron.schedule('friday-pick', '0 9 * * 5', $job$
  select net.http_post(
    url := 'https://bxkiuaapyiflnmqhodgm.supabase.co/functions/v1/send-friday-pick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
$job$);
