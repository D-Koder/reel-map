-- Sends every new in-app notification to the recipient's subscribed devices as a push.
-- The trigger calls the push-notification Edge Function. Its secret is the same FRIDAY_PICK_SECRET.
-- Replace <FRIDAY_PICK_SECRET> with that value before running this file (don't commit the real value).

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
      'Authorization', 'Bearer <FRIDAY_PICK_SECRET>',
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

create trigger push_notification
  after insert on public.notifications
  for each row execute function private.push_notification();
