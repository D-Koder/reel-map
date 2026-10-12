import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Reels saved from the iPhone Shortcut wait on the server (public.shared_reels).
// Each time the app opens or comes back to the front, they move into the reel inbox,
// which looks them up and adds them like a reel shared straight into the app.
// `enqueue(url)` returns false when there is no collection to save into yet; those reels stay on the server.
export function useShortcutReels({ userId, ready, enqueue }) {
  const enqueueRef = useRef(enqueue);
  enqueueRef.current = enqueue;

  useEffect(() => {
    if (!userId || !ready) return undefined;
    let busy = false;

    const pickUp = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const { data, error } = await supabase
          .from('shared_reels')
          .select('id, url')
          .order('created_at', { ascending: true })
          .limit(50);
        if (error || !data?.length) return;
        const taken = data.filter((row) => enqueueRef.current(row.url)).map((row) => row.id);
        if (taken.length) await supabase.from('shared_reels').delete().in('id', taken);
      } finally {
        busy = false;
      }
    };

    pickUp();
    document.addEventListener('visibilitychange', pickUp);
    return () => document.removeEventListener('visibilitychange', pickUp);
  }, [userId, ready]);
}
