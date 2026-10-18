-- The push trigger and the Friday pick job read their password from Vault, instead of having it
-- written into their code (where it was mistyped, so every push was refused with 401 Unauthorized).
--
-- Before running: store the same value as the FRIDAY_PICK_SECRET Edge Function secret in Vault, once:
--   select vault.create_secret('<FRIDAY_PICK_SECRET>', 'push_secret', 'Password for the push Edge Functions');
-- (Don't commit the real value. To change it later: vault.update_secret, then the Edge Function secret.)
-- Safe to run more than once.

create or replace function private.push_notification()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform net.http_post(
    url := 'https://bxkiuaapyiflnmqhodgm.supabase.co/functions/v1/push-notification',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'user_id', new.user_id,
      'type', new.type,
      'message', new.message
    )
  );
  return new;
end;
$$;

-- Same name, so this replaces the existing job. 9:00 UTC every Friday (7pm Friday in Melbourne, AEST).
select cron.schedule(
  'friday-pick',
  '0 9 * * 5',
  $job$
  select net.http_post(
    url := 'https://bxkiuaapyiflnmqhodgm.supabase.co/functions/v1/send-friday-pick',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $job$
);
