import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getVibe, mapFilters } from '../lib/constants';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const MELBOURNE_CENTER = [144.9631, -37.8136];
const LONG_PRESS_MS = 1750;
const LONG_PRESS_MAX_MOVE_PX = 10;

// Turns a tapped spot into a street address for the add sheet. Returns '' if Mapbox can't.
async function reverseGeocode(lng, lat) {
  try {
    const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`);
    url.searchParams.set('access_token', MAPBOX_TOKEN);
    url.searchParams.set('types', 'address,poi');
    url.searchParams.set('limit', '1');
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return '';
    const result = await response.json();
    return result.features?.[0]?.place_name || '';
  } catch {
    return '';
  }
}

const MapScreen = forwardRef(function MapScreen({ places, membersOf, onOpenPin, onAddAt, showToast }, ref) {
  const [filter, setFilter] = useState('all');
  const [mapError, setMapError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [placesListOpen, setPlacesListOpen] = useState(true);
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const hasFittedBounds = useRef(false);
  const isClosingModal = useRef(false);
  const pendingZoomPlaceIdRef = useRef(null);  // ← ADD THIS LINE
  useImperativeHandle(ref, () => ({
    markModalClosing: () => { isClosingModal.current = true; },
  }), []);
  const located = useMemo(
    () => places.filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng)),
    [places]
  );
  const visible = located.filter((place) => filter === 'all' || place.category === filter);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainer.current || mapRef.current) return undefined;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    let map;
    try {
      map = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: MELBOURNE_CENTER,
        zoom: 11,
        attributionControl: true,
      });
    } catch (error) {
      console.error('Mapbox initialization failed:', error);
      setMapError('Mapbox could not initialize. Check that WebGL is enabled in this browser.');
      return undefined;
    }
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('error', (event) => {
      if (event.error) setMapError('Mapbox could not load the map. Check the Mapbox token and allowed URLs.');
    });
    map.once('load', () => {
      setMapError('');
      setMapReady(true);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      hasFittedBounds.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // The map panel is mounted while hidden on mobile, so initialize/resize it again
  // whenever its container becomes visible and receives its real viewport size.
  useEffect(() => {
    const container = mapContainer.current;
    const map = mapRef.current;
    if (!container || !map || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [mapReady]);

  useEffect(() => {
  const map = mapRef.current;
  if (!map || !mapReady || !map.isStyleLoaded()) return undefined;

  // Don't reset bounds if we're just closing a modal
  if (!isClosingModal.current) {  // ← ADD THIS CHECK
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = visible.map((place) => {
      const members = membersOf[place.collection_id] ?? [];
      const vibe = getVibe(members.map((member) => member.id), place.reactions);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `map-pin mapbox-pin ${vibe.consensus}`;
      button.setAttribute('aria-label', place.name);
      button.title = place.name;
      button.addEventListener('click', () => onOpenPin(place.id));

      const markerContent = document.createElement('span');
      markerContent.className = `pin-marker ${vibe.consensus}`;
      if (place.reel_thumbnail_url) {
        const image = document.createElement('img');
        image.src = place.reel_thumbnail_url;
        image.alt = '';
        image.className = 'map-pin-image';
        markerContent.append(image);
      } else {
        markerContent.textContent = place.category === 'cafe' ? '☕' : place.category === 'event' ? '🎉' : '🍽️';
      }
      button.append(markerContent);

      return new mapboxgl.Marker({ element: button, anchor: 'bottom' })
        .setLngLat([place.lng, place.lat])
        .addTo(map);
    });

    if (visible.length === 1 && !hasFittedBounds.current) {
      map.flyTo({ center: [visible[0].lng, visible[0].lat], zoom: 14, essential: true });
    } else if (visible.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      visible.forEach((place) => bounds.extend([place.lng, place.lat]));
      if (!hasFittedBounds.current) {
        map.fitBounds(bounds, { padding: { top: 100, right: 60, bottom: 80, left: 60 }, maxZoom: 14, duration: 600 });
      }
    }
    if (visible.length) hasFittedBounds.current = true;
  }

  isClosingModal.current = false;  // ← RESET FLAG AFTER RENDER

  return () => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
  };
}, [visible, membersOf, onOpenPin, mapReady]);

  // Press and hold the map for 1.75s to add a place at that spot.
  // Dragging or pinching cancels the press.
  const onAddAtRef = useRef(onAddAt);
  onAddAtRef.current = onAddAt;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;

    let timer = null;
    let startPoint = null;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    const start = (event) => {
      startPoint = event.point;
      cancel();
      const { lng, lat } = event.lngLat;
      timer = setTimeout(async () => {
        timer = null;
        if (navigator.vibrate) navigator.vibrate(30);
        const address = await reverseGeocode(lng, lat);
        onAddAtRef.current?.({ address, latitude: lat, longitude: lng });
      }, LONG_PRESS_MS);
    };
    const checkMove = (event) => {
      if (!timer || !startPoint) return;
      const distance = Math.hypot(event.point.x - startPoint.x, event.point.y - startPoint.y);
      if (distance > LONG_PRESS_MAX_MOVE_PX) cancel();
    };

    map.on('mousedown', start);
    map.on('touchstart', start);
    map.on('mousemove', checkMove);
    map.on('touchmove', checkMove);
    map.on('mouseup', cancel);
    map.on('touchend', cancel);
    map.on('dragstart', cancel);
    map.on('zoomstart', cancel);
    return () => {
      cancel();
      map.off('mousedown', start);
      map.off('touchstart', start);
      map.off('mousemove', checkMove);
      map.off('touchmove', checkMove);
      map.off('mouseup', cancel);
      map.off('touchend', cancel);
      map.off('dragstart', cancel);
      map.off('zoomstart', cancel);
    };
  }, [mapReady]);

  const selectFilter = (id) => {
    setFilter(id);
    const label = id === 'all' ? 'All' : id.charAt(0).toUpperCase() + id.slice(1);
    showToast(`🔍 Showing ${label}`);
  };

const openListedPlace = (place) => {
  const map = mapRef.current;
  if (!map) return;

  isClosingModal.current = false;
  hasFittedBounds.current = false;
  pendingZoomPlaceIdRef.current = place.id;

  // Zoom to location
  map.flyTo({ center: [place.lng, place.lat], zoom: 15, essential: true });

  // Re-render pins when zoom animation finishes
  const handleMoveEnd = () => {
    // Only process if this is still the pending zoom
    if (pendingZoomPlaceIdRef.current !== place.id) {
      return;
    }

    // Clear old markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Re-create markers
    markersRef.current = visible.map((p) => {
      const members = membersOf[p.collection_id] ?? [];
      const vibe = getVibe(members.map((member) => member.id), p.reactions);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `map-pin mapbox-pin ${vibe.consensus}`;
      button.setAttribute('aria-label', p.name);
      button.title = p.name;
      button.addEventListener('click', () => onOpenPin(p.id));

      const markerContent = document.createElement('span');
      markerContent.className = `pin-marker ${vibe.consensus}`;
      if (p.reel_thumbnail_url) {
        const image = document.createElement('img');
        image.src = p.reel_thumbnail_url;
        image.alt = '';
        image.className = 'map-pin-image';
        markerContent.append(image);
      } else {
        markerContent.textContent = p.category === 'cafe' ? '☕' : p.category === 'event' ? '🎉' : '🍽️';
      }
      button.append(markerContent);

      return new mapboxgl.Marker({ element: button, anchor: 'bottom' })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
    });
  };

  map.once('moveend', handleMoveEnd);
};

  return (
    <div className="screen map-screen">
      <div className="mapbox-map">
        {MAPBOX_TOKEN
          ? <div className="mapbox-canvas" ref={mapContainer} />
          : <div className="mapbox-message">Add VITE_MAPBOX_TOKEN to enable the interactive map.</div>}
        {mapError && <div className="mapbox-error" role="status">{mapError}</div>}
        <div className="map-controls" role="toolbar" aria-label="Filter pins">
          {mapFilters.map((f) => (
            <button
              key={f.id}
              className={`map-filter ${filter === f.id ? 'active' : ''}`}
              onClick={() => selectFilter(f.id)}
              aria-pressed={filter === f.id}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="map-place-list" aria-label="Places shown on map">
          <button type="button" className="map-place-list-title" aria-expanded={placesListOpen} onClick={() => setPlacesListOpen((open) => !open)}>
            Shown places ({visible.length}) <span aria-hidden="true">{placesListOpen ? '⌄' : '⌃'}</span>
          </button>
          {placesListOpen && (
            <div className="map-place-list-items">
              {visible.map((place) => (
                <button key={place.id} type="button" className="map-place-item" onClick={() => openListedPlace(place)}>
                  <span className="map-place-item-name">{place.name}</span>
                  {place.address && <span className="map-place-item-address">{place.address}</span>}
                </button>
              ))}
              {!visible.length && <span className="map-place-empty">No places match this filter.</span>}
            </div>
          )}
        </div>

        <div className="map-title">
          📍 {visible.length} {visible.length === 1 ? 'place' : 'places'}
          {places.length - located.length > 0 && (
            <span className="map-title-note"> · {places.length - located.length} without a location yet</span>
          )}
        </div>
      </div>
    </div>
  );
});

export default MapScreen;
