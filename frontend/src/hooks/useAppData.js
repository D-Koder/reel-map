import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { readJSON, writeJSON } from '../lib/storage';
import { INBOX_COLLECTION } from './useReelInbox';

const REALTIME_TABLES = ['collections', 'collection_members', 'places', 'reactions', 'bookings', 'collection_places', 'place_order'];

const COLLECTION_SELECT = `
  id, name, emoji, is_private, owner_id, created_at,
  collection_members(user_id, role, profile:profiles(id, display_name, avatar, avatar_url))
`;

const PROFILE_SELECT = `
  id, display_name, avatar, avatar_url, country
`;

// Turn database errors into something a person can act on.
function friendlyError(error) {
  if (error.code === '23505' && /bookings/.test(error.message + error.details)) {
    return 'Someone already booked this place';
  }
  if (error.code === '42501') return "You don't have permission to do that";
  return error.message;
}

function normalisePlace(row) {
  const reactions = Array.isArray(row.reactions)
    ? Object.fromEntries(row.reactions.map((reaction) => [reaction.user_id, reaction.feeling]))
    : row.reactions && typeof row.reactions === 'object'
      ? row.reactions
      : {};

  // Create one entry per collection this place belongs to
  const collections = row.collection_places ?? [];
  if (collections.length === 0) {
    // Place with no collections (shouldn't happen, but handle it)
    return [{
      ...row,
      collection_id: null,
      added_by: null,
      added_at: null,
      booking: null,
      reactions,
    }];
  }
  return collections.map((cp) => ({
    ...row,
    name: cp.custom_name || row.name,
    // The place's real name, for looking it up on Google Maps even when it's been renamed here.
    venue_name: row.name,
    category: cp.category || row.category,
    // Optional emoji chosen for this collection, shown next to the name.
    emoji: cp.custom_emoji || null,
    collection_id: cp.collection_id,
    // Every collection this place is in, so the edit sheet can offer only the others.
    collectionIds: collections.map((c) => c.collection_id),
    added_by: cp.added_by,
    added_at: cp.added_at,
    // Each collection has its own booking, so booking a place in one group doesn't show in another.
    booking: cp.booking ?? null,
    // The day an event is on, if someone set one, and its last day when it runs for several
    // (null = a one-day event). Only used for events.
    event_date: cp.event_date ?? null,
    event_end_date: cp.event_end_date ?? null,
    // Votes belong to this collection's entry (see 20261015090000_reactions_per_collection.sql).
    // Before that migration, cp.reactions is unset and the place's votes are used.
    reactions: cp.reactions ?? reactions,
  }));
}

function normaliseCollection(row) {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    isPrivate: row.is_private,
    ownerId: row.owner_id,
    members: (row.collection_members ?? [])
      .filter((m) => m.profile)
      .map((m) => ({ ...m.profile, role: m.role }))
      .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.display_name.localeCompare(b.display_name))),
  };
}

// The last data that loaded, kept on this device so the app opens with no signal.
const cacheKey = (userId) => `reelmap:data:${userId}`;
// My order for collections, as a list of ids. Kept here too, so it works before the
// profiles.collection_order column exists (see 20261013110000_collection_order.sql).
const collectionOrderKey = (userId) => `reelmap:collection-order:${userId}`;

// Collections in my order. Ones I haven't placed yet (new or just joined) keep their usual order, after.
export function orderCollections(collections, order) {
  const list = order ?? [];
  const rank = new Map(list.map((id, index) => [id, index]));
  return collections
    .map((collection, index) => ({ collection, index }))
    .sort((a, b) => (rank.get(a.collection.id) ?? list.length + a.index) - (rank.get(b.collection.id) ?? list.length + b.index))
    .map(({ collection }) => collection);
}

// Every vote I can see, by collection entry, once votes belong to a collection
// (see 20261015090000_reactions_per_collection.sql). Before then, hasCollections is false.
async function readReactions() {
  const res = await supabase.from('reactions').select('collection_id, place_id, user_id, feeling');
  return { ...res, hasCollections: !res.error };
}

// Every collection entry I can see, with its event days when the database has those columns
// (see 20261013090000_event_dates.sql and 20261018090000_event_end_dates.sql). Before then, it is read
// again without them.
async function readEntries() {
  const columns = 'place_id, collection_id, custom_name, custom_emoji, category';
  const withEnds = await supabase.from('collection_places').select(`${columns}, event_date, event_end_date`);
  if (!withEnds.error) return { ...withEnds, hasEventDates: true, hasEventEndDates: true };
  const withDates = await supabase.from('collection_places').select(`${columns}, event_date`);
  if (!withDates.error) return { ...withDates, hasEventDates: true, hasEventEndDates: false };
  return { ...(await supabase.from('collection_places').select(columns)), hasEventDates: false, hasEventEndDates: false };
}

export function useAppData(userId, showToast) {
  const [cached] = useState(() => readJSON(cacheKey(userId)));
  const [state, setState] = useState(() =>
    cached
      ? { loading: false, error: null, profile: cached.profile, collections: cached.collections, places: cached.places }
      : { loading: true, error: null, profile: null, collections: [], places: [] }
  );
  const [order, setOrder] = useState(() => cached?.order ?? {}); // place_id -> my position
  const refreshTimer = useRef(null);
  // False until the database has the event_date column (see 20261013090000_event_dates.sql).
  const [eventDatesReady, setEventDatesReady] = useState(false);
  // False until the database has the event_end_date column (see 20261018090000_event_end_dates.sql).
  const [eventEndDatesReady, setEventEndDatesReady] = useState(false);
  const [collectionOrder, setCollectionOrder] = useState(() => readJSON(collectionOrderKey(userId), []));
  // False until the database has profiles.collection_order; until then the order stays on this device.
  const orderSyncReady = useRef(false);
  // True once votes belong to a collection (reactions.collection_id exists); until then, votes are per place.
  const reactionsPerCollection = useRef(false);
  // My TBD collection (where shared reels land). ready is false until collections.is_inbox exists;
  // until then TBD is found by its name.
  const [inbox, setInbox] = useState({ ready: false, id: null });

  const refresh = useCallback(async () => {
    // Everything is asked for at once, so opening the app is one round trip instead of four.
    const [profileRes, collectionsRes, placesRes, orderRes, streakRes, entriesRes, bookingsRes, collectionOrderRes, inboxRes, reactionsRes] = await Promise.all([
      supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).single(),
      supabase.rpc('get_user_collections'),
      supabase.rpc('get_user_places'),
      supabase.from('place_order').select('place_id, collection_id, position'),
      supabase.rpc('get_streak'),
      // Each place's name, category and event day in each collection. The places function doesn't return these.
      readEntries(),
      supabase.from('bookings').select('place_id, collection_id, booked_by, planned_at, done_at, marked_by'),
      // Read on its own, so the app still loads before the column has been added.
      supabase.from('profiles').select('collection_order').eq('id', userId).maybeSingle(),
      supabase.from('collections').select('id').eq('owner_id', userId).eq('is_inbox', true).limit(1),
      readReactions(),
    ]);
    reactionsPerCollection.current = reactionsRes.hasCollections;
    const votes = {};
    for (const r of reactionsRes.hasCollections ? reactionsRes.data ?? [] : []) {
      (votes[`${r.collection_id}:${r.place_id}`] ??= {})[r.user_id] = r.feeling;
    }
    orderSyncReady.current = !collectionOrderRes.error;
    if (Array.isArray(collectionOrderRes.data?.collection_order)) {
      setCollectionOrder(collectionOrderRes.data.collection_order);
      writeJSON(collectionOrderKey(userId), collectionOrderRes.data.collection_order);
    }
    setInbox({ ready: !inboxRes.error, id: inboxRes.data?.[0]?.id ?? null });
    setEventDatesReady(entriesRes.hasEventDates);
    setEventEndDatesReady(entriesRes.hasEventEndDates);
    const eventDates = Object.fromEntries(
      (entriesRes.data ?? []).map((e) => [`${e.collection_id}:${e.place_id}`, e.event_date ?? null])
    );
    const eventEndDates = Object.fromEntries(
      (entriesRes.data ?? []).map((e) => [`${e.collection_id}:${e.place_id}`, e.event_end_date ?? null])
    );
    const failed = [profileRes, collectionsRes, placesRes, orderRes, streakRes, entriesRes, bookingsRes].find((r) => r.error);
    if (failed) {
      setState((s) => ({ ...s, loading: false, error: friendlyError(failed.error) }));
      return;
    }
    // Build order map by (collection_id, place_id)
    const nextOrder = Object.fromEntries(orderRes.data.map((o) => [`${o.collection_id}:${o.place_id}`, o.position]));
    setOrder(nextOrder);

    const entries = Object.fromEntries(entriesRes.data.map((e) => [`${e.collection_id}:${e.place_id}`, e]));
    const bookings = Object.fromEntries(bookingsRes.data.map((b) => [`${b.collection_id}:${b.place_id}`, b]));
    const places = placesRes.data.map(p => ({
      ...p,
      reactions: p.reactions || {},
      collection_places: (p.collection_places ? p.collection_places.filter(cp => cp) : []).map((cp) => {
        const entry = entries[`${cp.collection_id}:${p.id}`];
        return {
          ...cp,
          custom_name: entry?.custom_name ?? null,
          category: entry?.category ?? null,
          custom_emoji: entry?.custom_emoji ?? null,
          booking: bookings[`${cp.collection_id}:${p.id}`] ?? null,
          ...(reactionsRes.hasCollections && { reactions: votes[`${cp.collection_id}:${p.id}`] ?? {} }),
          event_date: eventDates[`${cp.collection_id}:${p.id}`] ?? null,
          event_end_date: eventEndDates[`${cp.collection_id}:${p.id}`] ?? null,
        };
      }),
    }));

    const next = {
      profile: {
        ...profileRes.data,
        current_streak: streakRes.data?.[0]?.current_streak ?? 0,
        best_streak: streakRes.data?.[0]?.best_streak ?? 0,
      },
      collections: collectionsRes.data.map(normaliseCollection),
      places: places.flatMap(normalisePlace),
    };
    setState({ loading: false, error: null, ...next });
    writeJSON(cacheKey(userId), { ...next, order: nextOrder });
  }, [userId]);

  // True when a change came in while the app was in the background, so it reloads on return.
  const missedChange = useRef(false);

  // Coalesce bursts of realtime events (e.g. a place + its reaction) into one reload.
  // While the app is in the background nothing reloads; one reload runs when it comes back.
  const scheduleRefresh = useCallback(() => {
    if (document.visibilityState === 'hidden') {
      missedChange.current = true;
      return;
    }
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refresh, 250);
  }, [refresh]);

  useEffect(() => {
    refresh();
    const channel = supabase.channel(`board-${userId}`);
    REALTIME_TABLES.forEach((table) =>
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleRefresh)
    );
    channel.subscribe();
    // Phones can drop the live connection in the background and miss changes without telling us,
    // so after a long time away it reloads once anyway.
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      const longAway = hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000;
      if (!missedChange.current && !longAway) return;
      missedChange.current = false;
      scheduleRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(refreshTimer.current);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [userId, refresh, scheduleRefresh]);

  // Run a write, report failures, then reload. Returns the response data, or null on failure.
  const run = useCallback(
    async (request) => {
      const { data, error } = await request;
      if (error) {
        showToast(`${friendlyError(error)}`);
        await refresh(); // undo any optimistic change
        return null;
      }
      await refresh();
      return data ?? true;
    },
    [refresh, showToast]
  );

  // One collection's entry for a place: votes and bookings belong to it, not to the place.
  const patchEntry = (collectionId, id, patch) =>
    setState((s) => ({
      ...s,
      places: s.places.map((p) => (p.id === id && p.collection_id === collectionId ? { ...p, ...patch } : p)),
    }));

  const patchPlace = (id, patch) =>
    setState((s) => ({ ...s, places: s.places.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  // My order first (per collection), then oldest first for places I've never sorted.
  const places = [...state.places].sort((a, b) => {
    const key_a = `${a.collection_id}:${a.id}`;
    const key_b = `${b.collection_id}:${b.id}`;
    const pa = order[key_a] ?? Number.POSITIVE_INFINITY;
    const pb = order[key_b] ?? Number.POSITIVE_INFINITY;
    return pa - pb || a.created_at.localeCompare(b.created_at);
  });

  // The event-day columns to save: the first day, and the last (the same day for a one-day pop-up,
  // empty when nobody gave one). The end is left out until the database has its column.
  const eventDays = (start, end) => {
    const days = { event_date: start || null };
    if (eventEndDatesReady) days.event_end_date = start && end && end >= start ? end : null;
    return days;
  };

  const actions = {
    refresh,

    setReaction: (place, feeling) => {
      if (!reactionsPerCollection.current) {
        patchPlace(place.id, { reactions: { ...place.reactions, [userId]: feeling } });
        return run(
          supabase
            .from('reactions')
            .upsert({ place_id: place.id, user_id: userId, feeling }, { onConflict: 'place_id,user_id' })
        );
      }
      // A vote counts in this collection only.
      patchEntry(place.collection_id, place.id, { reactions: { ...place.reactions, [userId]: feeling } });
      return run(
        supabase
          .from('reactions')
          .upsert(
            { collection_id: place.collection_id, place_id: place.id, user_id: userId, feeling },
            { onConflict: 'collection_id,place_id,user_id' }
          )
      );
    },

    addPlace: async ({ name, location, category, collectionId, reelUrl, venueDetails, feeling, customInfo, url, eventDate, eventEndDate }) => {
      // Call the add_place_to_collection() function. It reuses the venue for this location and always adds a new entry.
      const { data, error } = await supabase.rpc('add_place_to_collection', {
        p_collection_id: collectionId,
        p_name: name,
        p_category: category,
        p_lat: venueDetails?.latitude ?? null,
        p_lng: venueDetails?.longitude ?? null,
        p_address: venueDetails?.address || location.trim() || null,
        p_hours: venueDetails?.hours?.length ? venueDetails.hours : null,
        p_phone: venueDetails?.phone || null,
        p_booking_url: venueDetails?.bookingUrl || null,
        p_reel_url: reelUrl || null,
        p_maps_url: venueDetails?.mapsUrl || null,
        p_website_url: venueDetails?.websiteUrl || null,
        p_menu_url: venueDetails?.menuUrl || null,
        p_custom_info: customInfo || null,
        p_url: url || null,
      }).abortSignal(AbortSignal.timeout(20000));
      if (error) {
        showToast(error.name === 'AbortError' || error.name === 'TimeoutError'
          ? 'Saving took too long. Check your connection and try again.'
          : `${friendlyError(error)}`);
        return null;
      }
      const placeId = data;
      if (eventDate && category === 'event' && eventDatesReady) {
        const { error: dateError } = await supabase
          .from('collection_places')
          .update(eventDays(eventDate, eventEndDate))
          .eq('collection_id', collectionId)
          .eq('place_id', placeId);
        if (dateError) showToast(`Place saved, but the event date didn't save: ${friendlyError(dateError)}`);
      }
      if (feeling) {
        const { error: reactionError } = await supabase
          .from('reactions')
          .insert(reactionsPerCollection.current
            ? { collection_id: collectionId, place_id: placeId, user_id: userId, feeling }
            : { place_id: placeId, user_id: userId, feeling })
          .abortSignal(AbortSignal.timeout(10000));
        if (reactionError) showToast(`Place saved, but vibe didn't save: ${friendlyError(reactionError)}`);
      }
      void refresh().catch((refreshError) => {
        showToast(`Place saved, but refresh failed: ${refreshError.message}`);
      });
      return { id: placeId };
    },

    // Makes a new collection from an imported file (see lib/collectionFile.js) and adds its places
    // one at a time. onProgress(done, total) runs after each. Returns { collectionId, added, failed } or null.
    importCollection: async ({ name, emoji, places: rows }, onProgress) => {
      const { data: collectionId, error } = await supabase.rpc('create_collection', { p_name: name, p_emoji: emoji || '📥' });
      if (error || !collectionId) {
        showToast(error ? friendlyError(error) : "Couldn't make the collection");
        return null;
      }
      let added = 0;
      let failed = 0;
      for (const [index, row] of rows.entries()) {
        const { data: placeId, error: placeError } = await supabase.rpc('add_place_to_collection', {
          p_collection_id: collectionId,
          p_name: row.name,
          p_category: row.category,
          p_lat: row.lat,
          p_lng: row.lng,
          p_address: row.address,
          p_hours: row.hours?.length ? row.hours : null,
          p_phone: row.phone,
          p_booking_url: row.bookingUrl,
          p_reel_url: row.reelUrl,
          p_maps_url: row.mapsUrl,
          p_website_url: row.websiteUrl,
          p_menu_url: row.menuUrl,
          p_custom_info: row.note,
          p_url: row.url,
        }).abortSignal(AbortSignal.timeout(20000));
        if (placeError) failed += 1;
        else {
          added += 1;
          if (row.eventDate && row.category === 'event' && eventDatesReady) {
            await supabase
              .from('collection_places')
              .update(eventDays(row.eventDate, row.eventEndDate))
              .eq('collection_id', collectionId)
              .eq('place_id', placeId);
          }
        }
        onProgress?.(index + 1, rows.length);
      }
      await refresh();
      return { collectionId, added, failed };
    },

    // Name, emoji and category are per collection (collection_places).
    // Only whoever added the place can change it. The database quietly skips other people's rows, so
    // an update that changes nothing is reported as a failure instead of looking like it saved.
    updatePlace: async (place, { name, emoji, category, eventDate, eventEndDate }) => {
      const patch = { custom_name: name, custom_emoji: emoji || null, category };
      if (eventDatesReady) Object.assign(patch, eventDays(category === 'event' ? eventDate : null, eventEndDate));
      const { data, error } = await supabase
        .from('collection_places')
        .update(patch)
        .eq('collection_id', place.collection_id)
        .eq('place_id', place.id)
        .select('place_id');
      if (error) {
        showToast(`${friendlyError(error)}`);
        await refresh();
        return null;
      }
      if (!data?.length) {
        showToast('Only the person who added this place can change it');
        return null;
      }
      await refresh();
      return true;
    },

    // Copy: anyone who can see the place can add it to a collection they belong to.
    copyPlaceToCollection: (place, targetCollectionId) =>
      run(
        supabase.from('collection_places').insert({
          collection_id: targetCollectionId,
          place_id: place.id,
          added_by: userId,
          category: place.category,
          custom_name: place.name,
          custom_emoji: place.emoji ?? null,
        })
      ),

    // Move: only whoever added the place can move it (the database checks this too).
    movePlaceToCollection: (place, targetCollectionId) =>
      run(
        supabase
          .from('collection_places')
          .update({ collection_id: targetCollectionId })
          .eq('collection_id', place.collection_id)
          .eq('place_id', place.id)
      ),

    // Moves several places at once. Each one is sent on its own, so one that can't move
    // (added by someone else, or already in that collection) doesn't stop the rest.
    // Returns the places that moved, as they were before the move (for Undo).
    movePlaces: async (pins, targetCollectionId) => {
      const movable = pins.filter((p) => p.added_by === userId && p.collection_id !== targetCollectionId && !(p.collectionIds ?? []).includes(targetCollectionId));
      const results = await Promise.all(movable.map(async (p) => {
        const { data, error } = await supabase
          .from('collection_places')
          .update({ collection_id: targetCollectionId })
          .eq('collection_id', p.collection_id)
          .eq('place_id', p.id)
          .select('place_id');
        return !error && data?.length ? p : null;
      }));
      await refresh();
      const moved = results.filter(Boolean);
      return { moved, skipped: pins.length - moved.length };
    },

    deletePlace: (collectionId, placeId) =>
      run(supabase.rpc('delete_place', { p_collection_id: collectionId, p_place_id: placeId })),

    // Bookings belong to the place's entry in one collection.
    book: (place, plannedAt) =>
      run(supabase.from('bookings').insert({ collection_id: place.collection_id, place_id: place.id, planned_at: new Date(plannedAt).toISOString() })),

    markDone: (place) => {
      if (!place.booking) {
        return run(supabase.from('bookings').insert({ collection_id: place.collection_id, place_id: place.id, planned_at: new Date().toISOString(), done_at: new Date().toISOString(), marked_by: userId }));
      }
      return run(supabase.from('bookings').update({ done_at: new Date().toISOString(), marked_by: userId }).eq('collection_id', place.collection_id).eq('place_id', place.id));
    },

    reorder: (orderedIds, collectionId) => {
      const rows = orderedIds.map((placeId, i) => ({ user_id: userId, collection_id: collectionId, place_id: placeId, position: i }));
      setOrder((o) => ({ ...o, ...Object.fromEntries(rows.map((r) => [`${r.collection_id}:${r.place_id}`, r.position])) }));
      return run(supabase.from('place_order').upsert(rows, { onConflict: 'user_id,collection_id,place_id' }));
    },

    createCollection: (name, emoji = '📌') => run(supabase.rpc('create_collection', { p_name: name, p_emoji: emoji })),
    updateCollection: (id, patch) => run(supabase.from('collections').update(patch).eq('id', id)),

    // Making a collection private removes its other members (the owner confirms first).
    setCollectionPrivate: async (collectionId, makePrivate, confirm) => {
      const { data, error } = await supabase.rpc('set_collection_private', {
        p_collection_id: collectionId,
        p_private: makePrivate,
        p_confirm: confirm,
      });
      if (error) {
        showToast(`${friendlyError(error)}`);
        await refresh();
        return { ok: false };
      }
      await refresh();
      return { ok: true, removed: data ?? 0 };
    },

    // Saves my order for collections: on this device straight away, and to my account when it can.
    reorderCollections: async (ids) => {
      setCollectionOrder(ids);
      writeJSON(collectionOrderKey(userId), ids);
      if (!orderSyncReady.current) return true;
      const { error } = await supabase.from('profiles').update({ collection_order: ids }).eq('id', userId);
      if (error) showToast(`Order saved on this phone only: ${friendlyError(error)}`);
      return true;
    },

    // Makes my TBD collection and marks it, so it's still found after a rename.
    createInboxCollection: async () => {
      const id = await run(supabase.rpc('create_collection', { p_name: INBOX_COLLECTION.name, p_emoji: INBOX_COLLECTION.emoji }));
      if (typeof id !== 'string') return null;
      if (inbox.ready) {
        await supabase.from('collections').update({ is_inbox: true }).eq('id', id);
        setInbox({ ready: true, id });
      }
      return id;
    },

    updateProfile: (patch) => run(supabase.from('profiles').update(patch).eq('id', userId)),
    removeCollectionMember: (collectionId, memberId) => run(
      supabase.from('collection_members').delete().eq('collection_id', collectionId).eq('user_id', memberId)
    ),
    // The owner makes a member an editor or a viewer.
    setMemberRole: (collectionId, memberId, role) => run(
      supabase.rpc('set_member_role', { p_collection_id: collectionId, p_user_id: memberId, p_role: role })
    ),
    // Copies several places into a collection. Each one is sent on its own, so one that's already
    // there doesn't stop the rest. Returns how many copied.
    copyPlaces: async (pins, targetCollectionId) => {
      const copyable = pins.filter((p) => !(p.collectionIds ?? []).includes(targetCollectionId));
      const results = await Promise.all(copyable.map(async (p) => {
        const { error } = await supabase.from('collection_places').insert({
          collection_id: targetCollectionId,
          place_id: p.id,
          added_by: userId,
          category: p.category,
          custom_name: p.name,
          custom_emoji: p.emoji ?? null,
        });
        return !error;
      }));
      await refresh();
      const copied = results.filter(Boolean).length;
      return { copied, skipped: pins.length - copied };
    },
    deleteCollection: (collectionId) => run(supabase.from('collections').delete().eq('id', collectionId)),

    transferOwnership: (collectionId, newOwnerId) =>
      run(supabase.rpc('transfer_collection_ownership', { p_collection_id: collectionId, p_new_owner_id: newOwnerId })),

    deleteUser: (cascadeDelete = false) => run(supabase.rpc('delete_user', { p_cascade_delete: cascadeDelete })),

    createSampleData: () => run(supabase.rpc('create_sample_data')),
  };

  // Same array until the collections or the order change, so effects that use it don't re-run.
  const collections = useMemo(() => {
    // Without the is_inbox column, TBD is my first collection with that name.
    const inboxId = inbox.ready
      ? inbox.id
      : state.collections.find((c) => c.ownerId === userId && c.name === INBOX_COLLECTION.name)?.id;
    const marked = state.collections.map((c) => ({ ...c, isInbox: c.id === inboxId }));
    return orderCollections(marked, collectionOrder);
  }, [state.collections, collectionOrder, inbox, userId]);

  return { ...state, collections, places, eventDatesReady, eventEndDatesReady, ...actions };
}
