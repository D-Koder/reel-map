-- Each place of a list post, with its status while the Shortcut save looks it up:
-- [{ "name", "status": "looking" | "saved" | "needs_pick" | "failed", "error"? }].
-- Shown by the app as one row per place. Written only by the server (update_shared_reel_progress).

alter table public.shared_reels add column if not exists places_progress jsonb;

create or replace function public.update_shared_reel_progress(p_key text, p_url text, p_progress jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  select user_id into v_user from public.shortcut_keys where key = btrim(coalesce(p_key, ''));
  if v_user is null then
    return 'taken';
  end if;

  update public.shared_reels
  set places_progress = case when jsonb_typeof(p_progress) = 'array' then p_progress end
  where user_id = v_user and url = p_url;

  return 'updated';
end;
$$;

-- Server only, like the other Shortcut functions.
revoke all on function public.update_shared_reel_progress(text, text, jsonb) from public, anon, authenticated;
