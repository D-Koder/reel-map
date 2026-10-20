import { useCallback, useEffect, useRef, useState } from 'react';
import { readJSON, writeJSON } from '../lib/storage';
import { knownCategory } from '../lib/constants';
import { apiFetch } from '../lib/api';
import { forgetListedLookups, prefetchListedPlaces } from '../lib/listedLookups';

const inboxKey = (userId) => `reelmap:inbox:${userId}`;
const lastCollectionKey = (userId) => `reelmap:last-collection:${userId}`;

// Reels shared while scrolling land in this built-in collection, to sort out later.
export const INBOX_COLLECTION = { name: 'TBD', emoji: '📥' };

// My TBD collection, if I have one. useAppData marks it (it can be renamed, so not by name).
export function findInboxCollection(collections) {
  return collections.find((c) => c.isInbox) ?? null;
}

// The collection a place was last added to by hand.
export function rememberCollection(userId, collectionId) {
  if (collectionId) writeJSON(lastCollectionKey(userId), collectionId);
}

const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

// Reels shared into the app. Each one is kept on this device straight away, so it is never lost,
// then looked up in the background and added to TBD (made the first time it's needed).
// Item status: 'saving' | 'offline' (waits for a connection) | 'needs-place' (lookup found no venue) | 'failed'.
// remote: true marks a reel the server is still looking up (shared from the Shortcut). It shows as
// 'saving' but isn't looked up here; useShortcutReels updates or removes it when the server is done.
export function useReelInbox({ userId, collections, places, addPlace, createInboxCollection, online, showToast, onSaved }) {
  const [items, setItems] = useState(() => readJSON(inboxKey(userId), []));
  const running = useRef(new Set());
  // The latest props, for lookups that finish after a re-render.
  const latest = useRef();
  latest.current = { collections, places, addPlace, createInboxCollection, showToast, onSaved, items };
  // One TBD at a time, even when several reels arrive together.
  const creatingInbox = useRef(null);

  useEffect(() => writeJSON(inboxKey(userId), items), [userId, items]);

  const update = (id, patch) => setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const remove = useCallback((id) => setItems((list) => list.filter((item) => item.id !== id)), []);

  const pickCollection = useCallback(
    () => findInboxCollection(latest.current.collections)?.id ?? null,
    []
  );

  // TBD's id, making the collection if I don't have one yet.
  const inboxCollectionId = useCallback(async () => {
    const existing = pickCollection();
    if (existing) return existing;
    creatingInbox.current ??= Promise.resolve(latest.current.createInboxCollection()).finally(() => {
      creatingInbox.current = null;
    });
    const created = await creatingInbox.current;
    return typeof created === 'string' ? created : null;
  }, [pickCollection]);

  const process = useCallback(async (item) => {
    if (running.current.has(item.id)) return;
    running.current.add(item.id);
    update(item.id, { status: 'saving' });
    try {
      // The collection may have been deleted while this reel waited.
      const collectionId = latest.current.collections.some((c) => c.id === item.collectionId)
        ? item.collectionId
        : await inboxCollectionId();
      if (!collectionId) throw new Error('No collection to save into');
      const response = await apiFetch('/api/enrich-reel', {
        // from: 'inbox' asks the server to keep a debug row when no place is matched.
        body: JSON.stringify({ reelUrl: item.url, from: 'inbox' }),
        signal: AbortSignal.timeout(120000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || `Reel lookup returned HTTP ${response.status}`);

      const details = data.maps?.details;
      if (!details?.name) {
        // No confident venue match: the user picks it in the add sheet.
        const guess = data.placeName || data.venue || data.caption?.split('\n')[0].substring(0, 80) || '';
        // Keep what the lookup found, so Finish fills the add sheet without looking it up again.
        update(item.id, { status: 'needs-place', collectionId, name: guess, reelData: data });
        // A list post: its places are looked up now, so Finish opens with them ready.
        prefetchListedPlaces(item.url, data);
        return;
      }

      // A pop-up keeps its own name (the Maps match is only its street) and is saved as an event on its days.
      const popup = data.popup;
      const name = popup?.name || details.name;
      const created = await latest.current.addPlace({
        name,
        location: details.address || data.location || '',
        category: popup ? 'event' : knownCategory(data.category) || 'food',
        collectionId,
        reelUrl: item.url,
        venueDetails: popup ? { ...details, name } : details,
        // Sharing a reel means you're keen on it.
        feeling: 'keen',
        eventDate: popup?.startDate || null,
        eventEndDate: popup?.endDate || null,
      });
      if (!created) {
        update(item.id, { status: 'failed', collectionId, name, reelData: data });
        return;
      }
      remove(item.id);
      const collection = latest.current.collections.find((c) => c.id === collectionId);
      latest.current.onSaved?.(created.id, name, collection?.name);
    } catch {
      update(item.id, { status: navigator.onLine ? 'failed' : 'offline' });
    } finally {
      running.current.delete(item.id);
    }
  }, [inboxCollectionId, remove]);

  // reelData: a lookup the server already did (shared from the Shortcut, no clear match), so the
  // reel goes straight to Finish without looking it up again.
  const enqueue = useCallback((url, { reelData } = {}) => {
    // Null until TBD exists. The lookup makes it.
    const collectionId = pickCollection();
    const { places, collections, showToast } = latest.current;
    const saved = places.find((p) => p.reel_url === url);
    if (saved) {
      const collectionName = collections.find((c) => c.id === saved.collection_id)?.name ?? 'your collection';
      showToast(`Already saved in ${collectionName}`);
      return true;
    }
    const existing = latest.current.items.find((i) => i.url === url);
    if (existing && !existing.remote) {
      showToast('Already saving this reel');
      return true;
    }
    if (reelData) {
      const name = reelData.placeName || reelData.venue || reelData.caption?.split('\n')[0].substring(0, 80) || '';
      const ready = { id: existing?.id ?? newId(), url, collectionId, status: 'needs-place', name, reelData, addedAt: Date.now() };
      setItems((list) => (existing ? list.map((i) => (i.id === existing.id ? ready : i)) : [...list, ready]));
      prefetchListedPlaces(url, reelData);
      return true;
    }
    // The server gave up on a reel it was looking up: look it up here instead.
    if (existing) {
      const item = { ...existing, remote: false };
      setItems((list) => list.map((i) => (i.id === existing.id ? item : i)));
      if (navigator.onLine) process(item);
      return true;
    }
    const item = { id: newId(), url, collectionId, status: navigator.onLine ? 'saving' : 'offline', addedAt: Date.now() };
    setItems((list) => [...list, item]);
    showToast(navigator.onLine ? `Saved! Finding the place…` : `Saved! We'll find the place when you're online.`);
    if (navigator.onLine) process(item);
    return true;
  }, [pickCollection, process]);

  // A reel the server is looking up shows as "Finding the place…" until it's done.
  const watch = useCallback((url) => {
    setItems((list) => (list.some((i) => i.url === url)
      ? list
      : [...list, { id: newId(), url, collectionId: null, status: 'saving', remote: true, addedAt: Date.now() }]));
  }, []);
  // The server finished (saved it, or the reel is gone): the card goes.
  const unwatch = useCallback((url) => setItems((list) => list.filter((i) => !(i.remote && i.url === url))), []);

  // Picks up reels that were waiting for a connection, or were mid-lookup when the app closed.
  useEffect(() => {
    if (!online) return;
    items.filter((item) => !item.remote && (item.status === 'saving' || item.status === 'offline')).forEach(process);
    // List posts waiting for Finish: look up any of their places not kept from before.
    items.filter((item) => item.status === 'needs-place').forEach((item) => prefetchListedPlaces(item.url, item.reelData));
    // Only when the connection changes; `items` changes on every status update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, process]);

  // Removing a card (its ✕) also drops the place lookups kept for it on this device.
  const dismiss = useCallback((id) => {
    const item = latest.current.items.find((i) => i.id === id);
    if (item) forgetListedLookups(item.url);
    remove(id);
  }, [remove]);

  return { items, enqueue, watch, unwatch, retry: process, remove, dismiss };
}
