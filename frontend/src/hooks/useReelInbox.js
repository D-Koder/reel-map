import { useCallback, useEffect, useRef, useState } from 'react';
import { readJSON, writeJSON } from '../lib/storage';
import { knownCategory } from '../lib/constants';
import { apiFetch } from '../lib/api';
import { shareNote } from '../lib/shareText';
import { forgetListedLookups, lookupListedPlace, prefetchListedPlaces } from '../lib/listedLookups';
import { requestLocationApi } from '../lib/googlePlaces';
import { SAMPLE_DETAILS, SAMPLE_PREFIX, TOUR_MARK } from '../tour/steps';

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

// A carousel link remembers the slide it was copied on (?img_index=3), and the lookup then returns only that
// slide's place. Without it the lookup returns every place the post lists.
function withoutSlide(url) {
  try {
    const link = new URL(url);
    link.searchParams.delete('img_index');
    return link.toString();
  } catch {
    return url;
  }
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

  // Saves the place a lookup found, and removes the card. A pop-up keeps its own name (the Maps match is only
  // its street) and is saved as an event on its days.
  const saveFound = useCallback(async (item, data, collectionId) => {
    const details = data.maps.details;
    const popup = data.popup;
    const name = popup?.name || details.name;
    // Show the name as soon as it is known, while the place is being saved.
    update(item.id, { status: 'saving', name });
    const created = await latest.current.addPlace({
      name,
      location: details.address || data.location || '',
      category: popup ? 'event' : knownCategory(data.category) || 'food',
      collectionId,
      reelUrl: item.url.startsWith(SAMPLE_PREFIX) ? null : item.url,
      venueDetails: popup ? { ...details, name } : details,
      // Sharing a reel means you're keen on it.
      feeling: 'keen',
      eventDate: popup?.startDate || null,
      eventEndDate: popup?.endDate || null,
      eventRuns: popup?.runs?.length ? popup.runs : undefined,
      eventPrice: popup?.price || '',
      eventContact: popup?.contact || '',
      customInfo: item.customInfo || (popup ? popup.locationNote || popup.howToBook || '' : ''),
    });
    if (!created) {
      update(item.id, { status: 'failed', collectionId, name, reelData: data });
      return;
    }
    remove(item.id);
    const collection = latest.current.collections.find((c) => c.id === collectionId);
    latest.current.onSaved?.(created.id, name, collection?.name);
  }, [remove]);

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
        body: JSON.stringify({ reelUrl: item.confirm ? withoutSlide(item.url) : item.url, from: 'inbox', sharedText: shareNote(item.url) }),
        signal: AbortSignal.timeout(120000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || `Reel lookup returned HTTP ${response.status}`);
      // Cancelled (✕) while it ran: nothing is saved.
      if (!latest.current.items.some((i) => i.id === item.id)) return;

      // A pasted post that lists several places: pick which to save before anything is added.
      if (item.confirm && data.listedPlaces?.length > 1) {
        update(item.id, { status: 'confirm-list', collectionId, name: '', reelData: data });
        return;
      }

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

      // A pasted reel waits for a tap on the place it found; others save straight away.
      if (item.confirm) {
        const found = data.popup?.name || details.name;
        update(item.id, { status: 'confirm', collectionId, name: found, address: details.address || data.location || '', reelData: data });
        return;
      }
      await saveFound(item, data, collectionId);
    } catch {
      update(item.id, { status: navigator.onLine ? 'failed' : 'offline' });
    } finally {
      running.current.delete(item.id);
    }
  }, [inboxCollectionId, saveFound]);

  // A pasted reel's found place was approved (Save): it is added now.
  const confirm = useCallback(async (item) => {
    if (running.current.has(item.id) || !item.reelData?.maps?.details?.name) return;
    running.current.add(item.id);
    try {
      const collectionId = latest.current.collections.some((c) => c.id === item.collectionId)
        ? item.collectionId
        : await inboxCollectionId();
      if (!collectionId) throw new Error('No collection to save into');
      await saveFound(item, item.reelData, collectionId);
    } catch {
      update(item.id, { status: navigator.onLine ? 'failed' : 'offline' });
    } finally {
      running.current.delete(item.id);
    }
  }, [inboxCollectionId, saveFound]);

  // The places ticked on a pasted list post. Each is matched on Google Maps and saved when the match is clear.
  // The ones Maps can't match clearly are left to pick by hand in the Finish sheet.
  const saveListed = useCallback(async (item, lines) => {
    if (running.current.has(item.id) || !item.reelData?.listedPlaces?.length) return;
    running.current.add(item.id);
    const data = item.reelData;
    const listUrl = withoutSlide(item.url);
    const chosen = data.listedPlaces.filter((place) => lines.includes(place.line));
    const saved = [];
    const unclear = [];
    try {
      const collectionId = latest.current.collections.some((c) => c.id === item.collectionId)
        ? item.collectionId
        : await inboxCollectionId();
      if (!collectionId) throw new Error('No collection to save into');
      for (const [index, listed] of chosen.entries()) {
        update(item.id, { status: 'saving', progress: `${index + 1} of ${chosen.length}` });
        try {
          const { best, details } = await lookupListedPlace(listUrl, listed, data);
          if (!best) { unclear.push(listed); continue; }
          const venueDetails = details || await requestLocationApi({
            action: 'details',
            query: best.searchQuery,
            placeUrl: best.url,
            placeAddress: best.address,
            placeName: best.name,
            location: best.address || listed.address || data.area || '',
          });
          const created = await latest.current.addPlace({
            name: (venueDetails?.name || best.name || listed.name).trim(),
            location: (venueDetails?.address || best.address || listed.address || '').trim(),
            category: knownCategory(listed.category) || 'food',
            collectionId,
            reelUrl: listUrl,
            venueDetails,
            feeling: 'keen',
            customInfo: '',
            url: null,
            eventDate: null,
          });
          if (created) saved.push(created); else unclear.push(listed);
        } catch {
          unclear.push(listed);
        }
      }
      const { showToast: toast, collections } = latest.current;
      const collectionName = collections.find((c) => c.id === collectionId)?.name ?? 'your collection';
      if (!unclear.length) {
        remove(item.id);
        forgetListedLookups(listUrl);
        toast(`Saved ${saved.length} ${saved.length === 1 ? 'place' : 'places'} to ${collectionName}`);
        return;
      }
      toast(saved.length
        ? `Saved ${saved.length} to ${collectionName}. ${unclear.length} need picking by hand.`
        : "Couldn't match those on the map. Pick them by hand.");
      // What is left goes to Finish: a list when several, else the one place on its own.
      const reelData = unclear.length > 1
        ? { ...data, listedPlaces: unclear }
        : { ...data, listedPlaces: undefined, placeName: unclear[0].name, location: unclear[0].address || '', maps: undefined };
      update(item.id, { status: 'needs-place', url: listUrl, collectionId, name: unclear[0].name, progress: '', confirm: false, reelData });
    } catch {
      update(item.id, { status: navigator.onLine ? 'failed' : 'offline', progress: '' });
    } finally {
      running.current.delete(item.id);
    }
  }, [inboxCollectionId, remove]);

  // "Wrong place": the user picks the right one in the Finish sheet instead.
  const reject = useCallback((item) => {
    update(item.id, { status: 'needs-place', confirm: false, rejected: true });
    prefetchListedPlaces(item.url, item.reelData);
  }, []);

  // reelData: a lookup the server already did (shared from the Shortcut, no clear match), so the
  // reel goes straight to Finish without looking it up again.
  const enqueue = useCallback((url, { reelData, confirm: askFirst } = {}) => {
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
    const item = { id: newId(), url, collectionId, status: navigator.onLine ? 'saving' : 'offline', confirm: Boolean(askFirst), addedAt: Date.now() };
    setItems((list) => [...list, item]);
    showToast(askFirst ? 'Finding the place…' : navigator.onLine ? `Saved! Finding the place…` : `Saved! We'll find the place when you're online.`);
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

  // The tour's sample reel: a ready-made "is this the spot?" card, with no lookup. Saving it makes a sample place
  // (marked so the tour can remove it), through the same path as a real reel.
  const addSample = useCallback(() => {
    const reelData = { placeName: SAMPLE_DETAILS.name, location: SAMPLE_DETAILS.address, category: 'food', maps: { details: SAMPLE_DETAILS } };
    const item = {
      id: newId(), url: `${SAMPLE_PREFIX}${Date.now()}`, collectionId: pickCollection(), status: 'confirm', confirm: true,
      name: SAMPLE_DETAILS.name, address: SAMPLE_DETAILS.address, reelData, customInfo: TOUR_MARK, addedAt: Date.now(),
    };
    setItems((list) => [...list, item]);
  }, [pickCollection]);

  return { items, enqueue, confirm, reject, saveListed, addSample, watch, unwatch, retry: process, remove, dismiss };
}
