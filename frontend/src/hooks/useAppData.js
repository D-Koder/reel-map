import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { readJSON, writeJSON } from '../lib/storage';

const REALTIME_TABLES = ['collections', 'collection_members', 'places', 'reactions', 'bookings', 'collection_places', 'place_order'];

const PLACE_SELECT = `
  id, name, category, reel_url, reel_thumbnail_url, created_at,
  address, lat, lng, hours, phone, booking_url, website_url, subtitle, menu_url, menu, source, source_id,
  reactions(user_id, feeling),
  booking:bookings(collection_id, booked_by, planned_at, done_at, marked_by),
  collection_places!collection_places_place_id_fkey(collection_id, added_by, added_at, position)
`;

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
      position: null,
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
    position: cp.position,
    // Each collection has its own booking, so booking a place in one group doesn't show in another.
    booking: cp.booking ?? null,
    // The day an event is on, if someone set one. Only used for events.
    event_date: cp.event_date ?? null,
    reactions,
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
  const [collectionOrder, setCollectionOrder] = useState(() => readJSON(collectionOrderKey(userId), []));
  // False until the database has profiles.collection_order; until then the order stays on this device.
  const orderSyncReady = useRef(false);

  const refresh = useCallback(async () => {
    const [profileRes, collectionsRes, placesRes, orderRes, streakRes, entriesRes, bookingsRes] = await Promise.all([
      supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).single(),
      supabase.rpc('get_user_collections'),
      supabase.rpc('get_user_places'),
      supabase.from('place_order').select('place_id, collection_id, position'),
      supabase.rpc('get_streak'),
      // Each place's name and category in each collection. The places function doesn't return these.
      supabase.from('collection_places').select('place_id, collection_id, custom_name, custom_emoji, category'),
      supabase.from('bookings').select('place_id, collection_id, booked_by, planned_at, done_at, marked_by'),
    ]);
    // Read on its own, so the app still loads before the column has been added.
    const collectionOrderRes = await supabase.from('profiles').select('collection_order').eq('id', userId).maybeSingle();
    orderSyncReady.current = !collectionOrderRes.error;
    if (Array.isArray(collectionOrderRes.data?.collection_order)) {
      setCollectionOrder(collectionOrderRes.data.collection_order);
      writeJSON(collectionOrderKey(userId), collectionOrderRes.data.collection_order);
    }
    // Read on its own, so the app still loads before the event_date column has been added.
    const eventDatesRes = await supabase.from('collection_places').select('place_id, collection_id, event_date');
    setEventDatesReady(!eventDatesRes.error);
    const eventDates = Object.fromEntries(
      (eventDatesRes.data ?? []).map((e) => [`${e.collection_id}:${e.place_id}`, e.event_date])
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
          event_date: eventDates[`${cp.collection_id}:${p.id}`] ?? null,
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

  // Coalesce bursts of realtime events (e.g. a place + its reaction) into one reload.
  const scheduleRefresh = useCallback(() => {
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
    return () => {
      clearTimeout(refreshTimer.current);
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

  const actions = {
    refresh,

    setReaction: (place, feeling) => {
      patchPlace(place.id, { reactions: { ...place.reactions, [userId]: feeling } });
      return run(
        supabase
          .from('reactions')
          .upsert({ place_id: place.id, user_id: userId, feeling }, { onConflict: 'place_id,user_id' })
      );
    },

    addPlace: async ({ name, location, category, collectionId, reelUrl, reelThumbnailUrl, venueDetails, feeling, customInfo, url, eventDate }) => {
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
        p_reel_thumbnail_url: reelThumbnailUrl || null,
        p_source: venueDetails?.source || (venueDetails ? 'google_maps' : 'manual'),
        p_source_id: venueDetails?.mapsUrl || null,
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
          .update({ event_date: eventDate })
          .eq('collection_id', collectionId)
          .eq('place_id', placeId);
        if (dateError) showToast(`Place saved, but the event date didn't save: ${friendlyError(dateError)}`);
      }
      if (feeling) {
        const { error: reactionError } = await supabase
          .from('reactions')
          .insert({ place_id: placeId, user_id: userId, feeling })
          .abortSignal(AbortSignal.timeout(10000));
        if (reactionError) showToast(`Place saved, but vibe didn't save: ${friendlyError(reactionError)}`);
      }
      void refresh().catch((refreshError) => {
        showToast(`Place saved, but refresh failed: ${refreshError.message}`);
      });
      return { id: placeId };
    },

    // Name, emoji and category are per collection (collection_places).
    // Only whoever added the place can change it. The database quietly skips other people's rows, so
    // an update that changes nothing is reported as a failure instead of looking like it saved.
    updatePlace: async (place, { name, emoji, category, eventDate }) => {
      const patch = { custom_name: name, custom_emoji: emoji || null, category };
      if (eventDatesReady) patch.event_date = category === 'event' ? eventDate || null : null;
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

    updateProfile: (patch) => run(supabase.from('profiles').update(patch).eq('id', userId)),
    removeCollectionMember: (collectionId, memberId) => run(
      supabase.from('collection_members').delete().eq('collection_id', collectionId).eq('user_id', memberId)
    ),
    deleteCollection: (collectionId) => run(supabase.from('collections').delete().eq('id', collectionId)),

    transferOwnership: (collectionId, newOwnerId) =>
      run(supabase.rpc('transfer_collection_ownership', { p_collection_id: collectionId, p_new_owner_id: newOwnerId })),

    deleteUser: (cascadeDelete = false) => run(supabase.rpc('delete_user', { p_cascade_delete: cascadeDelete })),

    createSampleData: () => run(supabase.rpc('create_sample_data')),
  };

  // Same array until the collections or the order change, so effects that use it don't re-run.
  const collections = useMemo(() => orderCollections(state.collections, collectionOrder), [state.collections, collectionOrder]);

  return { ...state, collections, places, eventDatesReady, ...actions };
}
