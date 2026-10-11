import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeImageUrl } from '../lib/media';
import { readJSON, writeJSON } from '../lib/storage';

const inboxKey = (userId) => `reelmap:inbox:${userId}`;
const lastCollectionKey = (userId) => `reelmap:last-collection:${userId}`;

// The collection a place was last added to. Shared reels go there.
export function rememberCollection(userId, collectionId) {
  if (collectionId) writeJSON(lastCollectionKey(userId), collectionId);
}

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

// Reels shared into the app. Each one is kept on this device straight away, so it is never lost,
// then looked up in the background and added to the last collection used.
// Item status: 'saving' | 'offline' (waits for a connection) | 'needs-place' (lookup found no venue) | 'failed'.
export function useReelInbox({ userId, collections, places, addPlace, online, showToast, onSaved }) {
  const [items, setItems] = useState(() => readJSON(inboxKey(userId), []));
  const running = useRef(new Set());
  // The latest props, for lookups that finish after a re-render.
  const latest = useRef();
  latest.current = { collections, places, addPlace, showToast, onSaved, items };

  useEffect(() => writeJSON(inboxKey(userId), items), [userId, items]);

  const update = (id, patch) => setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const remove = useCallback((id) => setItems((list) => list.filter((item) => item.id !== id)), []);

  const pickCollection = useCallback(() => {
    const { collections } = latest.current;
    const last = readJSON(lastCollectionKey(userId));
    return collections.find((c) => c.id === last)?.id ?? collections[0]?.id ?? null;
  }, [userId]);

  const process = useCallback(async (item) => {
    if (running.current.has(item.id)) return;
    running.current.add(item.id);
    update(item.id, { status: 'saving' });
    try {
      // The collection may have been deleted while this reel waited.
      const collectionId = latest.current.collections.some((c) => c.id === item.collectionId)
        ? item.collectionId
        : pickCollection();
      const response = await fetch('/api/enrich-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reelUrl: item.url }),
        signal: AbortSignal.timeout(120000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || `Reel lookup returned HTTP ${response.status}`);

      const details = data.maps?.details;
      const thumbnailUrl = normalizeImageUrl(data.thumbnailUrl) || null;
      if (!details?.name) {
        // No confident venue match: the user picks it in the add sheet.
        const guess = data.placeName || data.caption?.split('\n')[0].substring(0, 80) || '';
        update(item.id, { status: 'needs-place', collectionId, name: guess, thumbnailUrl });
        return;
      }

      const created = await latest.current.addPlace({
        name: details.name,
        location: details.address || data.location || '',
        category: 'food',
        collectionId,
        reelUrl: item.url,
        reelThumbnailUrl: thumbnailUrl,
        venueDetails: details,
        // Sharing a reel means you're keen on it.
        feeling: 'keen',
      });
      if (!created) {
        update(item.id, { status: 'failed', collectionId, name: details.name, thumbnailUrl });
        return;
      }
      remove(item.id);
      const collection = latest.current.collections.find((c) => c.id === collectionId);
      latest.current.onSaved?.(created.id, details.name, collection?.name);
    } catch {
      update(item.id, { status: navigator.onLine ? 'failed' : 'offline' });
    } finally {
      running.current.delete(item.id);
    }
  }, [pickCollection, remove]);

  // Returns false when there's nowhere to save it yet (no collections).
  const enqueue = useCallback((url) => {
    const collectionId = pickCollection();
    if (!collectionId) return false;
    const { places, collections, showToast } = latest.current;
    const collectionName = collections.find((c) => c.id === collectionId)?.name ?? 'your collection';
    if (places.some((p) => p.reel_url === url && p.collection_id === collectionId)) {
      showToast(`👍 Already saved in ${collectionName}`);
      return true;
    }
    if (latest.current.items.some((i) => i.url === url)) {
      showToast('👍 Already saving this reel');
      return true;
    }
    const item = { id: newId(), url, collectionId, status: navigator.onLine ? 'saving' : 'offline', addedAt: Date.now() };
    setItems((list) => [...list, item]);
    showToast(navigator.onLine ? `✓ Saved! Finding the place…` : `✓ Saved! We'll find the place when you're online.`);
    if (navigator.onLine) process(item);
    return true;
  }, [pickCollection, process]);

  // Picks up reels that were waiting for a connection, or were mid-lookup when the app closed.
  const hasCollections = collections.length > 0;
  useEffect(() => {
    if (!online || !hasCollections) return;
    items.filter((item) => item.status === 'saving' || item.status === 'offline').forEach(process);
    // Only when the connection or collections change; `items` changes on every status update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, hasCollections, process]);

  return { items, enqueue, retry: process, remove };
}
