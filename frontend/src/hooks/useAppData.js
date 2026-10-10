import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const REALTIME_TABLES = ['collections', 'collection_members', 'places', 'reactions', 'bookings', 'collection_places', 'place_order'];

const PLACE_SELECT = `
  id, name, category, reel_url, reel_thumbnail_url, created_at,
  address, lat, lng, hours, phone, booking_url, website_url, subtitle, menu_url, menu, source, source_id,
  reactions(user_id, feeling),
  booking:bookings(booked_by, planned_at, done_at, marked_by),
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
      booking: row.booking?.[0] || null,
      reactions,
    }];
  }
  return collections.map((cp) => ({
    ...row,
    name: cp.custom_name || row.name,
    category: cp.category || row.category,
    collection_id: cp.collection_id,
    added_by: cp.added_by,
    added_at: cp.added_at,
    position: cp.position,
    booking: row.booking?.[0] || null,
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

export function useAppData(userId, showToast) {
  const [state, setState] = useState({ loading: true, error: null, profile: null, collections: [], places: [] });
  const [order, setOrder] = useState({}); // place_id -> my position
  const refreshTimer = useRef(null);

  const refresh = useCallback(async () => {
    const [profileRes, collectionsRes, placesRes, orderRes, streakRes] = await Promise.all([
      supabase.from('profiles').select(PROFILE_SELECT).eq('id', userId).single(),
      supabase.rpc('get_user_collections'),
      supabase.rpc('get_user_places'),
      supabase.from('place_order').select('place_id, collection_id, position'),
      supabase.rpc('get_streak'),
    ]);
    const failed = [profileRes, collectionsRes, placesRes, orderRes, streakRes].find((r) => r.error);
    if (failed) {
      setState((s) => ({ ...s, loading: false, error: friendlyError(failed.error) }));
      return;
    }
    // Build order map by (collection_id, place_id)
    setOrder(Object.fromEntries(orderRes.data.map((o) => [`${o.collection_id}:${o.place_id}`, o.position])));

    const places = placesRes.data.map(p => ({
      ...p,
      reactions: p.reactions || {},
      booking: p.booking ? p.booking.filter(b => b) : null,
      collection_places: p.collection_places ? p.collection_places.filter(cp => cp) : []
    }));

    setState({
      loading: false,
      error: null,
      profile: {
        ...profileRes.data,
        current_streak: streakRes.data?.[0]?.current_streak ?? 0,
        best_streak: streakRes.data?.[0]?.best_streak ?? 0,
      },
      collections: collectionsRes.data.map(normaliseCollection),
      places: places.flatMap(normalisePlace),
    });
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
        showToast(`⚠️ ${friendlyError(error)}`);
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

    addPlace: async ({ name, location, category, collectionId, reelUrl, reelThumbnailUrl, venueDetails, feeling }) => {
      // Call the add_place_to_collection() function which handles deduplication and linking
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
      }).abortSignal(AbortSignal.timeout(20000));
      if (error) {
        showToast(error.name === 'AbortError' || error.name === 'TimeoutError'
          ? '⚠️ Saving took too long. Check your connection and try again.'
          : `⚠️ ${friendlyError(error)}`);
        return null;
      }
      const placeId = data;
      if (feeling) {
        const { error: reactionError } = await supabase
          .from('reactions')
          .insert({ place_id: placeId, user_id: userId, feeling })
          .abortSignal(AbortSignal.timeout(10000));
        if (reactionError) showToast(`⚠️ Place saved, but vibe didn't save: ${friendlyError(reactionError)}`);
      }
      void refresh().catch((refreshError) => {
        showToast(`⚠️ Place saved, but refresh failed: ${refreshError.message}`);
      });
      return { id: placeId };
    },

    // Name and category are per collection (collection_places).
    updatePlace: (place, { name, category }) =>
      run(
        supabase
          .from('collection_places')
          .update({ custom_name: name, category })
          .eq('collection_id', place.collection_id)
          .eq('place_id', place.id)
      ),

    deletePlace: (collectionId, placeId) =>
      run(supabase.rpc('delete_place', { p_collection_id: collectionId, p_place_id: placeId })),

    book: (placeId, plannedAt) =>
      run(supabase.from('bookings').insert({ place_id: placeId, planned_at: new Date(plannedAt).toISOString() })),

    markDone: (placeId) => {
      const place = state.places.find((p) => p.id === placeId);
      if (!place?.booking) {
        return run(supabase.from('bookings').insert({ place_id: placeId, planned_at: new Date().toISOString(), done_at: new Date().toISOString(), marked_by: userId }));
      }
      return run(supabase.from('bookings').update({ done_at: new Date().toISOString(), marked_by: userId }).eq('place_id', placeId));
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
        showToast(`⚠️ ${friendlyError(error)}`);
        await refresh();
        return { ok: false };
      }
      await refresh();
      return { ok: true, removed: data ?? 0 };
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

  return { ...state, places, ...actions };
}
