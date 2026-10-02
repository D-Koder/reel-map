import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const REALTIME_TABLES = ['collections', 'collection_members', 'places', 'reactions', 'bookings', 'place_visits'];

const PLACE_SELECT = `
  id, collection_id, name, category, reel_url, reel_thumbnail_url, shared_by, added_by, created_at,
  venue:venues(id, name, subtitle, address, lat, lng, hours, phone, booking_url, menu_url, menu),
  reactions(user_id, feeling),
  booking:bookings(booked_by, planned_at),
  visit:place_visits(marked_by, done_at),
  sharer:profiles!places_shared_by_fkey(id, display_name, avatar)
`;

const COLLECTION_SELECT = `
  id, name, emoji, is_private, owner_id, created_at,
  collection_members(user_id, role, profile:profiles(id, display_name, avatar))
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
  return {
    ...row,
    reactions: Object.fromEntries((row.reactions ?? []).map((r) => [r.user_id, r.feeling])),
  };
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
    const [profileRes, collectionsRes, placesRes, orderRes] = await Promise.all([
      supabase.from('profiles').select('id, display_name, avatar').eq('id', userId).single(),
      supabase.from('collections').select(COLLECTION_SELECT).order('created_at'),
      supabase.from('places').select(PLACE_SELECT).order('created_at'),
      supabase.from('place_order').select('place_id, position'),
    ]);
    const failed = [profileRes, collectionsRes, placesRes, orderRes].find((r) => r.error);
    if (failed) {
      setState((s) => ({ ...s, loading: false, error: friendlyError(failed.error) }));
      return;
    }
    setOrder(Object.fromEntries(orderRes.data.map((o) => [o.place_id, o.position])));
    setState({
      loading: false,
      error: null,
      profile: profileRes.data,
      collections: collectionsRes.data.map(normaliseCollection),
      places: placesRes.data.map(normalisePlace),
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

  // My order first, then oldest first for places I've never sorted.
  const places = [...state.places].sort((a, b) => {
    const pa = order[a.id] ?? Number.POSITIVE_INFINITY;
    const pb = order[b.id] ?? Number.POSITIVE_INFINITY;
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
      let venueId = null;
      if (location?.trim()) {
        const { data: venue, error: venueError } = await supabase
          .from('venues')
          .insert({
            name: venueDetails?.name || name,
            subtitle: venueDetails?.subtitle || null,
            address: venueDetails?.address || location.trim(),
            lat: venueDetails?.latitude ?? null,
            lng: venueDetails?.longitude ?? null,
            hours: venueDetails?.hours?.length ? venueDetails.hours : null,
            phone: venueDetails?.phone || null,
            menu_url: venueDetails?.menuUrl || null,
            menu: venueDetails?.menuText ? { text: venueDetails.menuText } : null,
            source: venueDetails ? 'google_maps' : 'manual',
            source_id: venueDetails?.mapsUrl || null,
          })
          .select('id')
          .single();
        if (venueError) {
          showToast(`⚠️ ${friendlyError(venueError)}`);
          return null;
        }
        venueId = venue.id;
      }

      const { data, error } = await supabase
        .from('places')
        .insert({
          name,
          category,
          collection_id: collectionId,
          venue_id: venueId,
          reel_url: reelUrl || null,
          reel_thumbnail_url: reelThumbnailUrl || null,
          shared_by: userId,
        })
        .select('id')
        .single();
      if (error) {
        showToast(`⚠️ ${friendlyError(error)}`);
        return null;
      }
      if (feeling) await supabase.from('reactions').insert({ place_id: data.id, feeling });
      await refresh();
      return data;
    },

    updatePlace: (id, { name, category }) => {
      patchPlace(id, { name, category });
      return run(supabase.from('places').update({ name, category }).eq('id', id));
    },

    deletePlace: (id) => run(supabase.rpc('delete_place', { p_place_id: id })),
    restorePlace: (id) => run(supabase.rpc('restore_place', { p_place_id: id })),

    book: (placeId, plannedAt) =>
      run(supabase.from('bookings').insert({ place_id: placeId, planned_at: new Date(plannedAt).toISOString() })),

    markDone: (placeId) => run(supabase.from('place_visits').insert({ place_id: placeId })),

    reorder: (orderedIds) => {
      const rows = orderedIds.map((placeId, i) => ({ user_id: userId, place_id: placeId, position: i }));
      setOrder((o) => ({ ...o, ...Object.fromEntries(rows.map((r) => [r.place_id, r.position])) }));
      return run(supabase.from('place_order').upsert(rows, { onConflict: 'user_id,place_id' }));
    },

    createCollection: (name, emoji = '📌') => run(supabase.from('collections').insert({ name, emoji })),
    updateCollection: (id, patch) => run(supabase.from('collections').update(patch).eq('id', id)),

    updateProfile: (patch) => run(supabase.from('profiles').update(patch).eq('id', userId)),

    createSampleData: () => run(supabase.rpc('create_sample_data')),
  };

  return { ...state, places, ...actions };
}
