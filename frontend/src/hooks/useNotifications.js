import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bell, CalendarCheck, CircleCheck, Lock, LogOut, MapPin, MessageCircle, Trash2, UserPlus } from 'lucide-react';

const ICONS = {
  place_added: MapPin,
  place_reacted: MessageCircle,
  place_booked: CalendarCheck,
  place_done: CircleCheck,
  place_removed: Trash2,
  collection_joined: UserPlus,
  collection_left: LogOut,
  collection_private: Lock,
};

function formatTime(iso) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function useNotifications(userId) {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);

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
        (payload) => setRows((prev) => [payload.new, ...prev].slice(0, 50))
      )
      .subscribe();

    return () => {
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

  const items = rows.map((n) => ({
    id: n.id,
    type: n.type,
    message: n.message,
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
    markAllRead,
    clearAll,
    remove,
  };
}
