-- Run once in the Supabase SQL editor, after the send-friday-pick function is deployed and its secrets are set.
-- Replace <FRIDAY_PICK_SECRET> with the same value you set as the FRIDAY_PICK_SECRET function secret.
-- pg_cron runs in UTC. '0 9 * * 5' is 9:00 UTC every Friday (7pm Friday in Melbourne, AEST).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'friday-pick',
  '0 9 * * 5',
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
