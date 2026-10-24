-- save_shared_reel and mark_shortcut_connected are only called by api/save-reel.js, which uses the
-- service key. They were open to anon and authenticated, so anyone could call them straight
-- through the REST API (still needing a valid Shortcut key). Now only the server can.
revoke execute on function public.save_shared_reel(text, text) from public, anon, authenticated;
revoke execute on function public.mark_shortcut_connected(text) from public, anon, authenticated;
grant execute on function public.save_shared_reel(text, text) to service_role;
grant execute on function public.mark_shortcut_connected(text) to service_role;
