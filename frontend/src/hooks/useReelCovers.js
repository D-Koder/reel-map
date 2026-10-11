import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createCoverQueue, needsRefresh } from '../lib/coverQueue';

// Reads chunks of at most this many links, so the request URL stays a sensible length.
const CHUNK = 100;

async function fetchCoverFromServer(reelUrl) {
  const response = await fetch('/api/reel-cover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reelUrl }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Cover lookup returned HTTP ${response.status}`);
  return response.json();
}

// Latest cover for each Reel, shared by every place that uses that Reel.
// Covers are refreshed as cards scroll into view. See lib/coverQueue.js for the rules.
export function useReelCovers(places) {
  const [map, setMap] = useState({});
  const mapRef = useRef(map);
  mapRef.current = map;
  // Until the saved covers have loaded, requests wait here, so nothing is fetched twice.
  const loadedRef = useRef(false);
  const pendingRef = useRef(new Map());

  const reelUrls = useMemo(() => [...new Set(places.map((p) => p.reel_url).filter(Boolean))], [places]);
  const reelKey = reelUrls.join('|');

  // Load the saved covers for the Reels on screen.
  useEffect(() => {
    if (!reelUrls.length) return undefined;
    let cancelled = false;
    (async () => {
      const chunks = [];
      for (let i = 0; i < reelUrls.length; i += CHUNK) chunks.push(reelUrls.slice(i, i + CHUNK));
      const results = await Promise.all(
        chunks.map((chunk) =>
          supabase.from('reel_covers').select('reel_url, thumbnail_url, status, checked_at').in('reel_url', chunk)
        )
      );
      if (cancelled) return;
      const rows = results.flatMap((r) => r.data ?? []);
      setMap((current) => ({ ...current, ...Object.fromEntries(rows.map((row) => [row.reel_url, row])) }));
      loadedRef.current = true;
      // Run the requests that came in while the covers were loading.
      const waiting = [...pendingRef.current.values()];
      pendingRef.current.clear();
      waiting.forEach(({ place, broken }) => requestRef.current(place, broken));
    })();
    return () => {
      cancelled = true;
    };
    // reelKey stands in for reelUrls: the list is rebuilt on every render, but its contents only change with the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reelKey]);

  const queue = useMemo(
    () =>
      createCoverQueue({
        fetchCover: fetchCoverFromServer,
        onResult: async (reelUrl, result) => {
          // A missing cover is saved too, so the Reel isn't asked about again straight away.
          const row = {
            reel_url: reelUrl,
            thumbnail_url: result.thumbnailUrl ?? null,
            status: result.status === 'ok' && result.thumbnailUrl ? 'ok' : 'missing',
            checked_at: new Date().toISOString(),
          };
          setMap((current) => ({ ...current, [reelUrl]: row }));
          await supabase.from('reel_covers').upsert(row, { onConflict: 'reel_url' });
        },
      }),
    []
  );

  // Called when a card scrolls near the screen. `broken` is true when its image failed to load.
  const requestCover = useCallback(
    (place, broken = false) => {
      if (!place.reel_url) return;
      if (!loadedRef.current) {
        pendingRef.current.set(place.reel_url, { place, broken });
        return;
      }
      if (needsRefresh(mapRef.current[place.reel_url], broken)) queue.request(place.reel_url);
    },
    [queue]
  );
  // Used by the load step above, which runs before this function is defined in the render.
  const requestRef = useRef(requestCover);
  requestRef.current = requestCover;

  // Called when a card scrolls away, so a Reel still waiting in line is skipped.
  const cancelCover = useCallback((place) => {
    pendingRef.current.delete(place.reel_url);
    queue.cancel(place.reel_url);
  }, [queue]);

  return { map, requestCover, cancelCover };
}
