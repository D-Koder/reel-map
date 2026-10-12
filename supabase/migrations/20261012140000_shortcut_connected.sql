-- Lets Settings know the iPhone Shortcut is set up. The app can't see which Shortcuts are installed,
-- so the Shortcut reports in when Connect hands it the key. A new key clears it until Connect runs again.
-- Run after 20261012130000_shortcut_inbox.sql. Safe to run more than once.

alter table public.shortcut_keys add column if not exists connected_at timestamptz;

-- Called by /api/save-reel when the Shortcut has just saved its key.
create or replace function public.mark_shortcut_connected(p_key text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  update public.shortcut_keys set connected_at = now() where key = btrim(coalesce(p_key, ''));
  if not found then
    raise exception 'Unknown shortcut key' using errcode = '28000';
  end if;
  return 'connected';
end;
$$;

create or replace function public.reset_shortcut_key()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_key text;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  insert into public.shortcut_keys (user_id) values (v_user)
  on conflict (user_id) do update
    set key = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
        created_at = now(),
        connected_at = null
  returning key into v_key;
  return v_key;
end;
$$;

revoke execute on function public.mark_shortcut_connected(text) from public;
grant execute on function public.mark_shortcut_connected(text) to anon, authenticated;
