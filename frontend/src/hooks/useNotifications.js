import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const ICONS = {
  place_added: '📍',
  place_reacted: '💬',
  place_booked: '🟢',
  place_done: '✅',
  place_removed: '🗑️',
  collection_joined: '👋',
  collection_left: '🚪',
  collection_private: '🔒',
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

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, message, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error) setRows(data ?? []);
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

  const items = rows.map((n) => ({
    id: n.id,
    type: n.type,
    message: n.message,
    icon: ICONS[n.type] ?? '🔔',
    time: formatTime(n.created_at),
    read: Boolean(n.read_at),
  }));

  return {
    items,
    unreadCount: items.filter((n) => !n.read).length,
    markAllRead,
    clearAll,
  };
}
