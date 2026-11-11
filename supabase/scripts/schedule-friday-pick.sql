-- Run once in the Supabase SQL editor, after the send-friday-pick function is deployed and its secrets are set.
-- Replace <FRIDAY_PICK_SECRET> with the same value you set as the FRIDAY_PICK_SECRET function secret.
-- Runs every hour (pg_cron uses UTC). The function itself sends only to people for whom it is the hour and day
-- they chose in Settings (7pm by default), in their own time zone.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'friday-pick',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://bxkiuaapyiflnmqhodgm.supabase.co/functions/v1/send-friday-pick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <FRIDAY_PICK_SECRET>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
