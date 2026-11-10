import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bell, CalendarCheck, CalendarClock, CalendarX, CircleCheck, Clock, Lock, LogOut, MapPin, MessageCircle, Pencil, Trash2, UserPlus } from 'lucide-react';
import { localTimes } from '../lib/notificationTime';

const ICONS = {
  place_added: MapPin,
  place_reacted: MessageCircle,
  place_booked: CalendarCheck,
  place_booking_changed: CalendarClock,
  place_booking_cancelled: CalendarX,
  place_done: CircleCheck,
  place_removed: Trash2,
  collection_joined: UserPlus,
  collection_left: LogOut,
  collection_private: Lock,
  role_changed: Pencil,
  booking_reminder: Clock,
};

function formatTime(iso) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// onNew: called when a notification arrives live. A notification usually means something changed on the
// server (a shared reel saved to TBD), so the app uses it to reload what it shows.
export function useNotifications(userId, onNew) {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications')
      // '*' so optional place_id / collection_id columns come through when the table has them.
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error) setRows(data ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!userId) return undefined;
    load();

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          setRows((prev) => [payload.new, ...prev].slice(0, 50));
          onNewRef.current?.(payload.new);
        }
      )
      // A notification the server removed (a reminder that was replaced or is no longer useful) leaves the list too.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications' },
        (payload) => setRows((prev) => prev.filter((n) => n.id !== payload.old?.id))
      )
      .subscribe();

    // A phone pauses the live connection while the app is in the background, so what arrived meanwhile
    // (a newer reminder replacing an older one) is missed. Reload when the app comes back to the front.
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setRows((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await supabase.from('notifications').update({ read_at: now }).is('read_at', null);
  }, []);

  const clearAll = useCallback(async () => {
    setRows([]);
    await supabase.from('notifications').delete().eq('user_id', userId);
  }, [userId]);

  // One notification, gone from the list straight away.
  const remove = useCallback(async (id) => {
    setRows((prev) => prev.filter((n) => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  }, []);

  // Several at once, e.g. the reminders that were seen.
  const removeMany = useCallback(async (ids) => {
    if (!ids.length) return;
    setRows((prev) => prev.filter((n) => !ids.includes(n.id)));
    await supabase.from('notifications').delete().in('id', ids);
  }, []);

  // A "Pick the place" notification is made before its place exists, so it has no place id. Once the place
  // is saved, this gives the earliest one that is still unlinked the new place's id: the one quoting the
  // same name as the reel's lookup if there is one, else just the earliest. Tapping it then opens the place.
  const linkPlace = useCallback(async (placeId, reelName) => {
    const waiting = rowsRef.current
      .filter((n) => n.type === 'reel_needs_place' && !n.place_id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const name = String(reelName ?? '').trim().toLocaleLowerCase();
    const quoted = (n) => String(/"(.*)"/.exec(n.message)?.[1] ?? '').trim().toLocaleLowerCase();
    const target = (name && waiting.find((n) => quoted(n) === name)) || waiting[0];
    if (!target || !placeId) return;
    setRows((prev) => prev.map((n) => (n.id === target.id ? { ...n, place_id: placeId } : n)));
    await supabase.from('notifications').update({ place_id: placeId }).eq('id', target.id);
  }, []);

  const items = rows.map((n) => ({
    id: n.id,
    type: n.type,
    message: localTimes(n.message),
    icon: ICONS[n.type] ?? Bell,
    time: formatTime(n.created_at),
    read: Boolean(n.read_at),
    placeId: n.place_id ?? null,
    collectionId: n.collection_id ?? null,
  }));

  return {
    items,
    loaded,
    unreadCount: items.filter((n) => !n.read).length,
    reload: load,
    markAllRead,
    clearAll,
    remove,
    removeMany,
    linkPlace,
  };
}
