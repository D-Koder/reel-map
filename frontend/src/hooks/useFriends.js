import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { forgetFriendCode, friendCodeFromSearch, friendLink, pendingFriendCode, rememberFriendCode } from '../lib/friends';

// My friends and open requests, and what I can do with them. Every rule (who may ask whom, who may add whom)
// is enforced in the database; this only calls it and shows the answer.
export function useFriends(userId, showToast) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.rpc('my_friends');
    if (!alive.current) return;
    if (!error) setRows(data ?? []);
    setLoading(false);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  // Runs one database call, tells the person what happened, and reloads the list.
  const run = useCallback(async (call, message) => {
    const { data, error } = await call();
    if (error) { showToast?.(error.message); return null; }
    await load();
    const text = typeof message === 'function' ? message(data) : message;
    if (text) showToast?.(text);
    return data ?? true;
  }, [load, showToast]);

  const request = (person) => run(() => supabase.rpc('request_friend', { p_user_id: person.id }),
    (state) => (state === 'friend' ? `You and ${person.display_name} are friends` : `Request sent to ${person.display_name}`));
  const accept = (person) => run(() => supabase.rpc('respond_friend_request', { p_user_id: person.id, p_accept: true }), `You and ${person.display_name} are friends`);
  const decline = (person) => run(() => supabase.rpc('respond_friend_request', { p_user_id: person.id, p_accept: false }));
  const remove = (person) => run(() => supabase.rpc('remove_friend', { p_user_id: person.id }));
  const addToCollection = (collection, person) => run(
    () => supabase.rpc('add_friend_to_collection', { p_collection_id: collection.id, p_user_id: person.id }),
    (added) => (added ? `${person.display_name} was added to "${collection.name}"` : `${person.display_name} is already in "${collection.name}"`),
  );

  // My friend link, made the first time it is asked for.
  const getLink = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_friend_code');
    if (error || !data) { showToast?.("Couldn't make your friend link. Try again."); return null; }
    return friendLink(window.location.origin, data);
  }, [showToast]);

  // One tap: opens the phone's share sheet with a ready message (or copies the link).
  const shareLink = useCallback(async () => {
    const url = await getLink();
    if (!url) return;
    const text = 'Be my friend on Waylit Maps, so we can plan places together.';
    try {
      if (navigator.share) { await navigator.share({ title: 'Waylit Maps', text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      showToast?.('Link copied. Paste it in a message.');
    } catch (error) {
      if (error?.name !== 'AbortError') showToast?.("Couldn't share the link. Try again.");
    }
  }, [getLink, showToast]);

  return {
    loading,
    rows,
    friends: rows.filter((r) => r.direction === 'friend'),
    incoming: rows.filter((r) => r.direction === 'incoming'),
    outgoing: rows.filter((r) => r.direction === 'outgoing'),
    request, accept, decline, remove, addToCollection, shareLink, reload: load,
  };
}

// A friend link opened from a message: kept while signed out, used once the person is in. onDone runs after it worked.
export function useFriendLink(userId, showToast, onDone) {
  useEffect(() => {
    const code = friendCodeFromSearch(window.location.search);
    if (code) {
      rememberFriendCode(code);
      const rest = new URLSearchParams(window.location.search);
      rest.delete('friend');
      const query = rest.toString();
      window.history.replaceState({}, document.title, window.location.pathname + (query ? `?${query}` : ''));
    }
  }, []);

  const tried = useRef(false);
  useEffect(() => {
    if (!userId || tried.current) return;
    const code = pendingFriendCode();
    if (!code) return;
    tried.current = true;
    supabase.rpc('friend_by_code', { p_code: code }).then(({ data, error }) => {
      forgetFriendCode();
      showToast?.(error ? error.message : `You and ${data} are now friends`);
      if (!error) onDone?.();
    });
  }, [userId, showToast, onDone]);
}
