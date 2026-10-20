import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Coffee, LocateFixed, MapPin, PartyPopper, UtensilsCrossed, X } from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { categories, getVibe } from '../lib/constants';
import { MAPBOX_TOKEN, MELBOURNE_CENTER, SEARCH_BASE, guessCategory, retrievePlace, searchSuggestions } from '../lib/mapboxSearch';

const LONG_PRESS_MS = 1000;
const VIEW_KEY = 'waylit.mapView';

// Where the map was last moved to, so it opens there again. null if never saved.
function savedView() {
  try {
    const view = JSON.parse(localStorage.getItem(VIEW_KEY));
    return Array.isArray(view?.center) && Number.isFinite(view.zoom) ? view : null;
  } catch {
    return null;
  }
}
const LONG_PRESS_MAX_MOVE_PX = 10;

// Markers are plain DOM, so each category's icon is rendered to SVG markup once and reused.
const PIN_ICONS = { cafe: Coffee, event: PartyPopper, food: UtensilsCrossed, other: MapPin };
const pinIconMarkup = {};
function categoryPinIcon(category) {
  const key = PIN_ICONS[category] ? category : 'food';
  if (!pinIconMarkup[key]) {
    const Icon = PIN_ICONS[key];
    pinIconMarkup[key] = renderToStaticMarkup(<Icon className="pin-marker-icon" aria-hidden="true" />);
  }
  return pinIconMarkup[key];
}

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

// Straight-line distance in metres between two [lng, lat] points.
function distanceMetres(lng1, lat1, lng2, lat2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

function formatDistance(metres) {
  return metres < 1000 ? `${Math.round(metres / 10) * 10 || 5} m` : `${(metres / 1000).toFixed(1)} km`;
}

// Named places (shops, cafes, venues) around a held spot, nearest first. Up to 10, Mapbox's limit.
async function nearbyPlaces(lng, lat, signal) {
  const url = new URL(`${SEARCH_BASE}/reverse`);
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('types', 'poi');
  url.searchParams.set('limit', '10');
  url.searchParams.set('language', 'en');
  url.searchParams.set('access_token', MAPBOX_TOKEN);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Mapbox reverse returned HTTP ${response.status}`);
  const data = await response.json();
  return (data.features || [])
    .map((feature) => {
      const [placeLng, placeLat] = feature.geometry?.coordinates ?? [];
      const props = feature.properties ?? {};
      return {
        id: props.mapbox_id ?? `${placeLng},${placeLat},${props.name}`,
        name: props.name,
        address: props.full_address || props.place_formatted || '',
        lng: placeLng,
        lat: placeLat,
        category: guessCategory(props.poi_category),
        distance: distanceMetres(lng, lat, placeLng, placeLat),
      };
    })
    .filter((place) => place.name && Number.isFinite(place.lng) && Number.isFinite(place.lat))
    .sort((a, b) => a.distance - b.distance);
}

// Ring that grows and fades at the tapped point, confirming the hold registered. Removes itself when done.
function showPressRing(map, point) {
  const ring = document.createElement('div');
  ring.className = 'map-press-ring';
  ring.style.left = `${point.x}px`;
  ring.style.top = `${point.y}px`;
  map.getContainer().appendChild(ring);
  ring.animate(
    [
      { transform: 'scale(0.3)', opacity: 1 },
      { transform: 'scale(1.6)', opacity: 0 },
    ],
    { duration: 600, easing: 'ease-out' }
  ).onfinish = () => ring.remove();
}

// One marker per location. Entries at the same spot share it, and the count shows how many.
// Tapping opens the entry, or a list of entries when there is more than one.
function createVenueMarker(map, group, { membersOf, onOpenPin, onPickVenue }) {
  const place = group[0];
  const members = membersOf[place.collection_id] ?? [];
  const vibe = getVibe(members.map((member) => member.id), place.reactions);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `map-pin mapbox-pin ${vibe.consensus}`;
  button.setAttribute('aria-label', group.length > 1 ? `${place.name}, ${group.length} places here` : place.name);
  button.title = place.name;
  button.addEventListener('click', () => (group.length === 1 ? onOpenPin(`${place.collection_id}:${place.id}`) : onPickVenue(group)));

  // The category icon (or the place's own emoji) and the first letter of its name.
  const markerContent = document.createElement('span');
  markerContent.className = `pin-marker ${vibe.consensus}`;
  const label = document.createElement('span');
  label.className = 'pin-marker-label';
  if (place.emoji) {
    const emoji = document.createElement('span');
    emoji.className = 'pin-marker-label-emoji';
    emoji.textContent = place.emoji;
    label.append(emoji);
  } else {
    label.innerHTML = categoryPinIcon(place.category);
  }
  const initial = [...String(place.name || '').trim()][0];
  if (initial) {
    const letter = document.createElement('span');
    letter.className = 'pin-marker-letter';
    letter.textContent = initial.toLocaleUpperCase();
    label.append(letter);
  }
  markerContent.append(label);
  button.append(markerContent);

  if (group.length > 1) {
    const count = document.createElement('span');
    count.className = 'map-pin-count';
    count.textContent = String(group.length);
    button.append(count);
  }

  return new mapboxgl.Marker({ element: button, anchor: 'bottom' })
    .setLngLat([place.lng, place.lat])
    .addTo(map);
}

const MapScreen = forwardRef(function MapScreen({ places, collections = [], membersOf, showMyLocation = true, onScreen = true, onOpenPin, onAddAt, showToast }, ref) {
  // Ids unchecked in the chip rows. Empty means everything shows; unchecking every chip shows nothing.
  // Tracking what is hidden means a collection created later shows by default.
  const [hiddenCategories, setHiddenCategories] = useState(() => new Set());
  const [hiddenCollections, setHiddenCollections] = useState(() => new Set());
  const [mapError, setMapError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [placesListOpen, setPlacesListOpen] = useState(false);
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const hasFittedBounds = useRef(false);
  const isClosingModal = useRef(false);
  // Marker element for each place id, so a focused place's pin can be highlighted.
  const markerElsRef = useRef(new Map());
  // The entry ("collection:place") picked from the list or a notification: its pin bounces and a label pops up.
  const [focusedKey, setFocusedKey] = useState(null);
  // A focus asked for before the map finished loading.
  const pendingFocusRef = useRef(null);
  const popupRef = useRef(null);
  // The "What's here?" picker after a long-press: { lng, lat, status, results, address }.
  const [nearby, setNearby] = useState(null);
  const pressMarkerRef = useRef(null);
  const [searchText, setSearchText] = useState('');
  // The text a suggestion was picked for. The list stays closed until the text changes.
  const pickedTextRef = useRef(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState(''); // '' | 'searching' | 'none' | 'error'
  // Groups the suggestions for one search and the pick that follows, for Mapbox billing.
  const searchSessionRef = useRef(null);
  const searchMarkerRef = useRef(null);
  // The user's position ([lng, lat]) ranks search results. null until they allow location.
  const [searchBias, setSearchBias] = useState(null);
  const locationRequestedRef = useRef(false);
  const located = useMemo(
    () => places.filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng)),
    [places]
  );

  const flyToPlace = (map, place) => {
    map.resize();
    map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), 15), essential: true });
  };

  // Shows a place on the map: turns its filters back on, flies there and pops up its label.
  // Returns false when the place has no location.
  const focusPlace = useCallback((place) => {
    if (!Number.isFinite(place?.lat) || !Number.isFinite(place?.lng)) return false;
    const show = (setHidden, id) => setHidden((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    show(setHiddenCategories, place.category);
    show(setHiddenCollections, place.collection_id);
    // Focusing should not be undone by the first-load fit to all pins.
    hasFittedBounds.current = true;
    setFocusedKey(`${place.collection_id}:${place.id}`);
    const map = mapRef.current;
    if (map && mapReady) flyToPlace(map, place);
    else pendingFocusRef.current = place;
    return true;
  }, [mapReady]);

  useImperativeHandle(ref, () => ({
    markModalClosing: () => { isClosingModal.current = true; },
    focusPlace,
  }), [focusPlace]);
  // Category and collection filters combine: a place must match both.
  // A place in several collections shows once: the map has one row per collection the place is in.
  const visible = useMemo(() => {
    const shown = new Set();
    return located.filter((place) => {
      const matches = !hiddenCategories.has(place.category) && !hiddenCollections.has(place.collection_id);
      if (!matches || shown.has(place.id)) return false;
      shown.add(place.id);
      return true;
    });
  }, [located, hiddenCategories, hiddenCollections]);
  // Entries at the same location share one icon.
  const venueGroups = useMemo(() => {
    const groups = new Map();
    visible.forEach((place) => {
      const key = `${place.lat.toFixed(5)},${place.lng.toFixed(5)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(place);
    });
    return [...groups.values()];
  }, [visible]);
  // The list shown when a location icon with several entries is tapped.
  const [venuePicker, setVenuePicker] = useState(null);
  const allCategoriesShown = categories.every((c) => !hiddenCategories.has(c.id));
  const allCollectionsShown = collections.every((c) => !hiddenCollections.has(c.id));

  // Collections load after the first render. Start with all of them unchecked, once, when they arrive.
  const collectionsSeeded = useRef(false);
  useEffect(() => {
    if (collectionsSeeded.current || !collections.length) return;
    collectionsSeeded.current = true;
    setHiddenCollections(new Set(collections.map((c) => c.id)));
  }, [collections]);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainer.current || mapRef.current) return undefined;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const startView = savedView();
    // A saved spot wins over fitting the map to the pins.
    if (startView) hasFittedBounds.current = true;
    let map;
    try {
      map = new mapboxgl.Map({
        container: mapContainer.current,
        // Muted basemap so the pins stand out. Night lighting when the phone is in dark mode,
        // so the screen doesn't flash bright at night.
        style: 'mapbox://styles/mapbox/standard',
        config: {
          basemap: {
            theme: 'faded',
            lightPreset: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'night' : 'day',
            showPointOfInterestLabels: false,
            showTransitLabels: false,
            show3dObjects: false,
          },
        },
        center: startView?.center ?? MELBOURNE_CENTER,
        zoom: startView?.zoom ?? 11,
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
    // Dragging the map closes the shown places list. Where it stops is kept for next time.
    map.on('dragstart', () => setPlacesListOpen(false));
    map.on('moveend', (event) => {
      if (!event.originalEvent) return;
      hasFittedBounds.current = true;
      const { lng, lat } = map.getCenter();
      try {
        localStorage.setItem(VIEW_KEY, JSON.stringify({ center: [lng, lat], zoom: map.getZoom() }));
      } catch { /* private mode: the map just opens on the default spot */ }
    });
    map.once('load', () => {
      setMapError('');
      setMapReady(true);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      hasFittedBounds.current = false;
      searchMarkerRef.current?.remove();
      searchMarkerRef.current = null;
      pressMarkerRef.current?.remove();
      pressMarkerRef.current = null;
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
  if (!map || !mapReady) return undefined;

  // Always redraw the markers. Closing a modal used to skip this, and the cleanup
  // below had already removed them, so the pins disappeared.
  markersRef.current.forEach((marker) => marker.remove());
  markerElsRef.current = new Map();
  markersRef.current = venueGroups.map((group) => {
    const marker = createVenueMarker(map, group, { membersOf, onOpenPin, onPickVenue: setVenuePicker });
    group.forEach((place) => markerElsRef.current.set(place.id, marker.getElement()));
    return marker;
  });

  // Don't refit the map when we're just closing a modal.
  if (!isClosingModal.current) {
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
}, [visible, venueGroups, membersOf, onOpenPin, mapReady]);

  // A focus asked for while the map was loading runs once it is ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !pendingFocusRef.current) return;
    flyToPlace(map, pendingFocusRef.current);
    pendingFocusRef.current = null;
  }, [mapReady]);

  // The focused pin bounces and sits above the others. Runs after the markers are redrawn.
  const focusedPlace = focusedKey && (located.find((p) => `${p.collection_id}:${p.id}` === focusedKey)
    ?? located.find((p) => p.id === focusedKey.split(':')[1]));
  useEffect(() => {
    markerElsRef.current.forEach((element, placeId) => {
      const focused = placeId === focusedPlace?.id;
      element.classList.toggle('map-pin-focused', focused);
      element.style.zIndex = focused ? '5' : '';
    });
  }, [focusedPlace?.id, venueGroups, membersOf, mapReady]);

  // The label over the focused pin. Tapping "Open" opens the place; tapping the map closes the label.
  const onOpenPinRef = useRef(onOpenPin);
  onOpenPinRef.current = onOpenPin;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !focusedPlace) return undefined;
    const content = document.createElement('div');
    content.className = 'map-focus-label';
    const title = document.createElement('strong');
    title.textContent = focusedPlace.name;
    content.append(title);
    const detail = focusedPlace.custom_info || focusedPlace.address;
    if (detail) {
      const line = document.createElement('span');
      line.textContent = detail;
      content.append(line);
    }
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'map-focus-open';
    open.textContent = 'Open place →';
    open.addEventListener('click', () => onOpenPinRef.current(focusedKey));
    content.append(open);

    let removing = false;
    const popup = new mapboxgl.Popup({ offset: 46, maxWidth: '240px', className: 'map-focus-popup', focusAfterOpen: false })
      .setLngLat([focusedPlace.lng, focusedPlace.lat])
      .setDOMContent(content)
      .addTo(map);
    popup.on('close', () => {
      if (!removing) setFocusedKey(null);
    });
    popupRef.current = popup;
    return () => {
      removing = true;
      popup.remove();
      popupRef.current = null;
    };
    // Rebuilt only when what it shows changes, not on every places refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, focusedKey, focusedPlace?.name, focusedPlace?.lat, focusedPlace?.lng, focusedPlace?.custom_info, focusedPlace?.address]);

  // My location: a blue dot that follows the phone, plus a button that flies to it.
  // Starts the first time the map is on screen, so the permission prompt makes sense.
  // Turned off in Settings. The location stays on this device.
  const [locationStarted, setLocationStarted] = useState(false);
  const toastRef = useRef(showToast);
  toastRef.current = showToast;
  useEffect(() => {
    if (onScreen && showMyLocation) setLocationStarted(true);
  }, [onScreen, showMyLocation]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !showMyLocation || !locationStarted || !navigator.geolocation) return undefined;
    const dot = document.createElement('div');
    dot.className = 'my-location-dot';
    dot.setAttribute('aria-label', 'You are here');
    const marker = new mapboxgl.Marker({ element: dot });
    let here = null;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        here = [position.coords.longitude, position.coords.latitude];
        marker.setLngLat(here);
        if (!marker.getElement().isConnected) marker.addTo(map);
        // Only the first fix: search ranking doesn't need every step you take.
        setSearchBias((current) => current ?? here);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
    );
    const button = {
      onAdd() {
        this.el = document.createElement('div');
        this.el.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
        this.el.innerHTML = '<button type="button" class="my-location-btn" aria-label="Go to my location" title="Go to my location">'
          + renderToStaticMarkup(<LocateFixed aria-hidden="true" />) + '</button>';
        this.el.firstChild.addEventListener('click', () => {
          if (here) map.flyTo({ center: here, zoom: Math.max(map.getZoom(), 14) });
          else toastRef.current?.("Can't find your location yet. Check location access for this app.");
        });
        return this.el;
      },
      onRemove() {
        this.el.remove();
      },
    };
    map.addControl(button, 'bottom-right');
    return () => {
      navigator.geolocation.clearWatch(watchId);
      marker.remove();
      map.removeControl(button);
    };
  }, [mapReady, showMyLocation, locationStarted]);

  // Asked once, when the search box is first tapped. Used only when the map has no view yet.
  const requestUserLocation = () => {
    if (locationRequestedRef.current || !navigator.geolocation) return;
    locationRequestedRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (position) => setSearchBias([position.coords.longitude, position.coords.latitude]),
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  };

  // Suggestions wait 350ms after the last keystroke. Older requests are cancelled.
  // Runs again when the user's location arrives, so results re-rank.
  useEffect(() => {
    const text = searchText.trim();
    if (text.length < 3 || pickedTextRef.current === searchText) {
      setSearchResults([]);
      setSearchStatus('');
      return undefined;
    }
    // Like Google Maps: rank near the map's current view. Fall back to the user's location, then Melbourne.
    const view = mapRef.current?.getCenter();
    const origin = view ? [view.lng, view.lat] : (searchBias ?? MELBOURNE_CENTER);
    searchSessionRef.current ??= crypto.randomUUID();
    const sessionToken = searchSessionRef.current;
    const controller = new AbortController();
    setSearchStatus('searching');
    const timer = setTimeout(async () => {
      try {
        const results = await searchSuggestions(text, controller.signal, origin, sessionToken);
        setSearchResults(results);
        setSearchStatus(results.length ? '' : 'none');
      } catch (error) {
        if (error.name !== 'AbortError') setSearchStatus('error');
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchText, searchBias]);

  const clearSearch = () => {
    pickedTextRef.current = null;
    setSearchText('');
    setSearchResults([]);
    setSearchStatus('');
    searchSessionRef.current = null;
    searchMarkerRef.current?.remove();
    searchMarkerRef.current = null;
  };

  const chooseSearchResult = async (result) => {
    const map = mapRef.current;
    if (!map) return;
    const sessionToken = searchSessionRef.current ?? crypto.randomUUID();
    searchSessionRef.current = null;
    // The typed text stays as it is. Only the suggestion list closes, and stays closed.
    pickedTextRef.current = searchText;
    setSearchResults([]);
    setSearchStatus('retrieving');
    let coords;
    try {
      coords = await retrievePlace(result.id, sessionToken, AbortSignal.timeout(10000));
    } catch {
      setSearchStatus('error');
      return;
    }
    const place = { ...result, lng: coords.lng, lat: coords.lat };
    setSearchStatus('');
    searchMarkerRef.current?.remove();
    // Tapping the found place's pin opens the add sheet for it.
    const marker = new mapboxgl.Marker({ color: '#c2410c' }).setLngLat([place.lng, place.lat]);
    const pin = marker.getElement();
    pin.style.cursor = 'pointer';
    pin.setAttribute('role', 'button');
    pin.setAttribute('aria-label', `Add ${coords.name || place.name}`);
    pin.addEventListener('click', (event) => {
      event.stopPropagation();
      onAddAt({
        name: coords.name || place.name,
        address: coords.address || place.address,
        latitude: place.lat,
        longitude: place.lng,
        ...(coords.category ? { category: coords.category } : {}),
      });
    });
    searchMarkerRef.current = marker.addTo(map);
    new mapboxgl.Popup({ offset: 40, closeButton: false, closeOnClick: true, focusAfterOpen: false })
      .setLngLat([place.lng, place.lat])
      .setText('Tap the pin to add')
      .addTo(map);
    map.flyTo({ center: [place.lng, place.lat], zoom: 16, essential: true });
  };

  const closeNearby = () => {
    setNearby(null);
    pressMarkerRef.current?.remove();
    pressMarkerRef.current = null;
  };

  // After a long-press: lists the named places around the spot, nearest first, plus the spot itself.
  const openNearby = async (lng, lat) => {
    const map = mapRef.current;
    pressMarkerRef.current?.remove();
    if (map) pressMarkerRef.current = new mapboxgl.Marker({ color: '#c2410c' }).setLngLat([lng, lat]).addTo(map);
    setNearby({ lng, lat, status: 'loading', results: [], address: '' });
    const [results, address] = await Promise.all([
      nearbyPlaces(lng, lat, AbortSignal.timeout(8000)).catch(() => null),
      reverseGeocode(lng, lat),
    ]);
    // Ignore the answer if the picker was closed or another spot was held meanwhile.
    setNearby((current) => (current?.lng === lng && current?.lat === lat
      ? { ...current, status: results ? 'done' : 'error', results: results ?? [], address }
      : current));
  };

  const pickNearby = (place) => {
    closeNearby();
    onAddAt(place
      ? { name: place.name, address: place.address, latitude: place.lat, longitude: place.lng, category: place.category }
      : { address: nearby.address, latitude: nearby.lat, longitude: nearby.lng });
  };

  // Press and hold the map for 1s to see what's there and add it.
  // Dragging or pinching cancels the press.
  const openNearbyRef = useRef(openNearby);
  openNearbyRef.current = openNearby;
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
      timer = setTimeout(() => {
        timer = null;
        if (navigator.vibrate) navigator.vibrate(30);
        showPressRing(map, startPoint);
        openNearbyRef.current(lng, lat);
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

  const toggleHidden = (setHidden, id) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // "All" shows everything, or hides everything when all are already shown.
  const toggleAllCategories = () => {
    setHiddenCategories(allCategoriesShown ? new Set(categories.map((c) => c.id)) : new Set());
  };
  const toggleAllCollections = () => {
    setHiddenCollections(allCollectionsShown ? new Set(collections.map((c) => c.id)) : new Set());
  };


const openListedPlace = (place) => {
    focusPlace(place);
  };

  return (
    <div className="screen map-screen">
      <div className="mapbox-map">
        {MAPBOX_TOKEN
          ? <div className="mapbox-canvas" ref={mapContainer} />
          : <div className="mapbox-message">Add VITE_MAPBOX_TOKEN to enable the interactive map.</div>}
        {mapError && <div className="mapbox-error" role="status">{mapError}</div>}
        <form
          className="map-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            if (searchResults[0]) chooseSearchResult(searchResults[0]);
          }}
        >
          <div className="map-search-box">
            <input
              className="map-search-input"
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onFocus={requestUserLocation}
              onKeyDown={(event) => { if (event.key === 'Escape') clearSearch(); }}
              placeholder="Search a place or address"
              aria-label="Search a place or address"
              enterKeyHint="search"
              autoComplete="off"
            />
            {searchText && (
              <button type="button" className="map-search-clear" onClick={clearSearch} aria-label="Clear search"><X aria-hidden="true" /></button>
            )}
          </div>
          {searchStatus === 'searching' && (
            <div className="map-search-results" role="status" aria-label="Searching">
              {[0, 1, 2].map((i) => (
                <div key={i} className="map-search-result" aria-hidden="true">
                  <span className="skeleton-bar" style={{ width: '70%' }} />
                  <span className="skeleton-bar" style={{ width: '45%', height: '10px' }} />
                </div>
              ))}
            </div>
          )}
          {searchStatus === 'retrieving' && (
            <div className="map-search-results" role="status" aria-label="Finding place">
              <div className="map-search-result" aria-hidden="true">
                <span className="skeleton-bar" style={{ width: '60%' }} />
                <span className="skeleton-bar" style={{ width: '40%', height: '10px' }} />
              </div>
            </div>
          )}
          {searchStatus === 'none' && <div className="map-search-note">No matches. Try a different spelling.</div>}
          {searchStatus === 'error' && <div className="map-search-note">Search is unavailable right now.</div>}
          {searchResults.length > 0 && (
            <div className="map-search-results">
              {searchResults.map((result) => (
                <button key={result.id} type="button" className="map-search-result" onClick={() => chooseSearchResult(result)}>
                  <strong>{result.name}</strong>
                  <span>{result.address}</span>
                </button>
              ))}
            </div>
          )}
        </form>

        <div className="map-controls" role="toolbar" aria-label="Filter pins">
          <button
            className={`map-filter ${allCategoriesShown ? 'active' : ''}`}
            onClick={toggleAllCategories}
            aria-pressed={allCategoriesShown}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`map-filter ${!hiddenCategories.has(c.id) ? 'active' : ''}`}
              onClick={() => toggleHidden(setHiddenCategories, c.id)}
              aria-pressed={!hiddenCategories.has(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {collections.length > 0 && (
          <div className="map-controls map-controls-collections" role="toolbar" aria-label="Filter by collection">
            <button
              className={`map-filter ${allCollectionsShown ? 'active' : ''}`}
              onClick={toggleAllCollections}
              aria-pressed={allCollectionsShown}
            >
              All collections
            </button>
            {collections.map((c) => (
              <button
                key={c.id}
                className={`map-filter ${!hiddenCollections.has(c.id) ? 'active' : ''}`}
                onClick={() => toggleHidden(setHiddenCollections, c.id)}
                aria-pressed={!hiddenCollections.has(c.id)}
              >
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
        )}

        {located.length > 0 && (
          <div className="map-place-list" aria-label="Places shown on map">
            <button type="button" className="map-place-list-title" aria-expanded={placesListOpen} onClick={() => setPlacesListOpen((open) => !open)}>
              Shown places ({visible.length}) <span aria-hidden="true">{placesListOpen ? '⌄' : '⌃'}</span>
            </button>
            {placesListOpen && (
              <div className="map-place-list-items">
                {visible.map((place) => (
                  <button key={place.id} type="button" className="map-place-item" onClick={() => openListedPlace(place)}>
                    <span className="map-place-item-name">{place.name}</span>
                    {place.custom_info && <span className="map-place-item-info">{place.custom_info}</span>}
                    {place.address && <span className="map-place-item-address">{place.address}</span>}
                  </button>
                ))}
                {!visible.length && <span className="map-place-empty">No places match this filter.</span>}
              </div>
            )}
          </div>
        )}

        {nearby && (
          <div className="modal-overlay" onClick={closeNearby}>
            <div
              className="modal location-verify-modal"
              role="dialog"
              aria-label="Places near this spot"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <div className="modal-title"><MapPin className="ico" aria-hidden="true" /> What's here?</div>
                <button type="button" className="modal-close" onClick={closeNearby} aria-label="Close"><X aria-hidden="true" /></button>
              </div>
              <p className="modal-label">Tap a place to add it.</p>
              <div className="location-verify-results nearby-results">
                {nearby.status === 'loading' && [0, 1, 2].map((i) => (
                  <div key={i} className="location-verify-result" aria-hidden="true">
                    <span className="skeleton-bar" style={{ width: '65%' }} />
                    <span className="skeleton-bar" style={{ width: '40%', height: '10px' }} />
                  </div>
                ))}
                {nearby.results.map((place) => (
                  <button key={place.id} type="button" className="location-verify-result" onClick={() => pickNearby(place)}>
                    <strong>{place.name} <span className="nearby-distance">{formatDistance(place.distance)}</span></strong>
                    {place.address && <span>{place.address}</span>}
                  </button>
                ))}
                {nearby.status === 'done' && !nearby.results.length && <p className="map-search-note">No named places right here.</p>}
                {nearby.status === 'error' && <p className="map-search-note">Couldn't load nearby places.</p>}
                <button type="button" className="location-verify-result nearby-spot" disabled={nearby.status === 'loading'} onClick={() => pickNearby(null)}>
                  <strong><MapPin className="ico" aria-hidden="true" /> Just this spot</strong>
                  <span>{nearby.address || 'The exact spot you held'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {venuePicker && (
          <div className="modal-overlay" onClick={() => setVenuePicker(null)}>
            <div
              className="modal location-verify-modal"
              role="dialog"
              aria-label="Places at this location"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <div className="modal-title">{venuePicker[0].address || venuePicker[0].name}</div>
                <button type="button" className="modal-close" onClick={() => setVenuePicker(null)} aria-label="Close"><X aria-hidden="true" /></button>
              </div>
              <p className="modal-label">{venuePicker.length} places saved here. Choose one:</p>
              <div className="location-verify-results">
                {venuePicker.map((place) => (
                  <button
                    key={`${place.collection_id}:${place.id}`}
                    type="button"
                    className="location-verify-result"
                    onClick={() => {
                      setVenuePicker(null);
                      onOpenPin(`${place.collection_id}:${place.id}`);
                    }}
                  >
                    <strong>{place.name}</strong>
                    <span>{place.custom_info || 'No custom info'}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="map-title">
          <MapPin className="ico" aria-hidden="true" /> {visible.length} {visible.length === 1 ? 'place' : 'places'}
          {places.length - located.length > 0 && (
            <span className="map-title-note"> · {places.length - located.length} without a location yet</span>
          )}
        </div>
      </div>
    </div>
  );
});

export default MapScreen;
