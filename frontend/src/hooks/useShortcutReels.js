import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// A server lookup older than this has died (Vercel stops it at 120 seconds), so the app takes over.
const LOOKING_STALE_MS = 150000;
// How often to check again while the server is still looking a reel up.
const CHECK_AGAIN_MS = 5000;

// Reels saved from the iPhone Shortcut wait on the server (public.shared_reels), where they are looked
// up straight away (api/save-reel.js). A clear match is saved to TBD there and the reel is removed.
// Each time the app opens or comes back to the front, the ones left move into the reel inbox:
//   - still being looked up: shown as "Finding the place…" and checked again every few seconds;
//   - looked up with no clear match (lookup): straight to the Finish card, without looking it up again;
//   - anything else: looked up here, like a reel shared straight into the app.
// `enqueue(url)` returns false when there is no collection to save into yet; those reels stay on the server.
export function useShortcutReels({ userId, ready, inbox }) {
  const inboxRef = useRef(inbox);
  inboxRef.current = inbox;

  useEffect(() => {
    if (!userId || !ready) return undefined;
    let busy = false;
    let timer = null;

    const pickUp = async () => {
      clearTimeout(timer);
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const { data, error } = await supabase
          .from('shared_reels')
          .select('id, url, looking_since, lookup')
          .order('created_at', { ascending: true })
          .limit(50);
        if (error) return;
        const { enqueue, watch, unwatch, items } = inboxRef.current;
        const now = Date.now();
        const looking = (data ?? []).filter((row) => !row.lookup && row.looking_since &&
          now - Date.parse(row.looking_since) < LOOKING_STALE_MS);
        looking.forEach((row) => watch(row.url));
        // Cards for reels the server finished and removed (saved to TBD, which loads on its own).
        const onServer = new Set((data ?? []).map((row) => row.url));
        items.filter((item) => item.remote && !onServer.has(item.url)).forEach((item) => unwatch(item.url));

        const taken = (data ?? [])
          .filter((row) => !looking.includes(row))
          .filter((row) => enqueue(row.url, row.lookup ? { reelData: row.lookup } : {}))
          .map((row) => row.id);
        if (taken.length) await supabase.from('shared_reels').delete().in('id', taken);
        if (looking.length) timer = setTimeout(pickUp, CHECK_AGAIN_MS);
      } finally {
        busy = false;
      }
    };

    pickUp();
    document.addEventListener('visibilitychange', pickUp);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', pickUp);
    };
  }, [userId, ready]);
}
