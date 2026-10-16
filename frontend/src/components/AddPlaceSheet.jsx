import React, { useEffect, useRef, useState } from 'react';
import { bestPlaceMatch, entriesAtSpot, reelPlaceHints, relatedPlaces } from '../lib/places';
import DuplicateWarning from './DuplicateWarning';
import { ArrowUpRight, Heart, MessageCircle, TriangleAlert, X } from 'lucide-react';
import useSheetDrag from '../lib/useSheetDrag';
import { categories, feelings } from '../lib/constants';
import ReelEmbedThumb, { reelEmbed } from './ReelEmbedThumb';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
// Value of the last Collection option. Picking it opens the "New collection" pop-up.
const NEW_COLLECTION = '__new__';

const isValidReelUrl = (url) => {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('instagram.com')) return urlObj.pathname.includes('/reel/') || urlObj.pathname.includes('/p/');
    if (urlObj.hostname === 'vm.tiktok.com') return true;
    return urlObj.hostname.endsWith('tiktok.com') && urlObj.pathname.includes('/video/');
  } catch {
    return false;
  }
};

// The unsent form is kept in this browser, so closing the sheet by accident doesn't lose it.
const DRAFT_KEY = 'reelmap.addPlaceDraft';

function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) ?? null;
  } catch {
    return null;
  }
}

function writeDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage can be blocked; the form still works without a saved draft.
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}

// Same tolerance as add_place_to_collection(): about 1m.
// '' when empty, the full URL when valid, null when it isn't a web link. "example.com" gets https://.
function normaliseEntryUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export default function AddPlaceSheet({ collections, places = [], eventDatesReady = false, onAdd, onAddAll, onCreateCollection, onClose, initialPlace = null, initialCollectionId = null, initialReelUrl = null, initialReelData = null }) {
  // A place opened from a long-press on the map has its own pin, so it doesn't use the saved draft.
  // A link shared into the app starts a new add, so it doesn't use the saved draft either.
  const draftable = !initialPlace && !initialReelUrl;
  const [draft] = useState(() => (draftable ? readDraft() : null));

  // Step management. A place opened from a long-press on the map skips the reel step.
  const [step, setStep] = useState(initialPlace ? 'details' : (draft?.step ?? 'reel')); // 'reel' | 'details'

  // Step 1: Reel Link
  const [reelUrlInput, setReelUrlInput] = useState(initialReelUrl ?? draft?.reelUrlInput ?? '');
  const [urlError, setUrlError] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiLogs, setApiLogs] = useState([]);

  // Step 2: Place Details
  const [reelUrl, setReelUrl] = useState(draft?.reelUrl ?? '');
  const [scrapedData, setScrapedData] = useState(draft?.scrapedData ?? null);
  const [mapsData, setMapsData] = useState(draft?.mapsData ?? null);
  const [name, setName] = useState(initialPlace?.name ?? draft?.name ?? '');
  // True once the user types a name. Picking a Google place then keeps it; otherwise the place's name
  // replaces the guess from the caption (like "0 likes, 0 comments - …").
  const nameTypedRef = useRef(false);
  const [location, setLocation] = useState(initialPlace?.address ?? draft?.location ?? '');
  // Exact spot tapped on the map. Used as the pin until a Google place is picked.
  const [pinCoords, setPinCoords] = useState(initialPlace
    ? { latitude: initialPlace.latitude, longitude: initialPlace.longitude, source: 'map_pin' }
    : null);
  const [category, setCategory] = useState(initialPlace?.category ?? draft?.category ?? 'food');
  // Only collections I can add to are passed in, so a remembered one I now only view falls back to the first.
  const [collectionId, setCollectionId] = useState(() => {
    const wanted = initialCollectionId ?? draft?.collectionId;
    return collections.some((c) => c.id === wanted) ? wanted : collections[0]?.id ?? '';
  });
  const [feeling, setFeeling] = useState(draft?.feeling ?? 'keen');
  // What this entry is at the location, e.g. "Pottery class", and an optional link for it.
  const [customInfo, setCustomInfo] = useState(draft?.customInfo ?? '');
  const [eventDate, setEventDate] = useState(draft?.eventDate ?? '');
  const [entryUrl, setEntryUrl] = useState(draft?.entryUrl ?? '');
  const [entryUrlError, setEntryUrlError] = useState('');
  // Saved places already at this location. Shown as a warning before a second entry is added.
  const [duplicates, setDuplicates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [locationCandidates, setLocationCandidates] = useState(draft?.locationCandidates ?? []);
  const [locationSearchDone, setLocationSearchDone] = useState(draft?.locationSearchDone ?? false);
  const [loadingCandidateUrl, setLoadingCandidateUrl] = useState(null);
  // A list post shared without a slide: the listed place being looked up after the person tapped it.
  const [choosingListed, setChoosingListed] = useState(null);
  const [addingAllListed, setAddingAllListed] = useState(false);
  const [verifyResults, setVerifyResults] = useState(null);
  const [verifyCandidate, setVerifyCandidate] = useState(null);
  const [verifyingLocation, setVerifyingLocation] = useState(false);
  const sheetRef = useRef(null);
  const sheetDrag = useSheetDrag(sheetRef, onClose);
  // The warning button sends this lookup's details and a comment to the debug table.
  const [reportOpen, setReportOpen] = useState(false);
  const [reportComment, setReportComment] = useState('');
  const [reportStatus, setReportStatus] = useState('');
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);
  // Manual adds (no reel) say so in the header.
  const sheetTitle = step === 'details' && !reelUrl ? 'Manual add a place' : 'Add a place';

  // Save the form as it changes, so a draft survives the sheet closing by accident.
  useEffect(() => {
    if (!draftable) return;
    writeDraft({
      step, reelUrlInput, reelUrl, scrapedData, mapsData, name, location, category, collectionId, feeling,
      locationCandidates, locationSearchDone, customInfo, entryUrl, eventDate,
    });
  }, [draftable, step, reelUrlInput, reelUrl, scrapedData, mapsData, name, location, category, collectionId, feeling,
    locationCandidates, locationSearchDone, customInfo, entryUrl, eventDate]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setApiLogs(prev => [...prev, { message, type, timestamp }]);
    console.log(`[${type.toUpperCase()}] ${message}`);
  };

  const scrapeReel = async (url) => {
    setLoading(true);
    setApiLogs([]);
    addLog('Starting to fetch reel data...', 'info');

    try {
      const response = await fetch('/api/enrich-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reelUrl: url }),
      });
      const data = await response.json().catch(() => ({}));
      const error = response.ok ? null : new Error(data.error || `Reel enrichment returned HTTP ${response.status}`);

      if (error) {
        let detail = error.message;
        const response = error.context;
        if (response && typeof response.clone === 'function') {
          try {
            const payload = await response.clone().json();
            detail = payload.error || payload.message || detail;
          } catch {
            // Keep the SDK error when the function response isn't JSON.
          }
        }
        addLog(`API Error: ${detail}`, 'error');
        throw new Error(detail);
      }

      if (data?.success) {
        addLog(`Successfully scraped reel data`, 'success');
        applyReelData(data);
      } else {
        addLog(`Response not successful: ${JSON.stringify(data)}`, 'error');
      }
    } catch (error) {
      addLog(`Scrape failed: ${error.message}`, 'error');
      console.error('Scrape error:', error);
    }
    setLoading(false);
  };

  // Fills the form from a reel lookup: the name, address and Google Maps match or choices.
  const applyReelData = (data) => {
    setScrapedData(data);
    setName(data.placeName || data.caption?.split('\n')[0].substring(0, 80) || '');
    setLocation(data.location || '');
    addLog(`Location: ${data.location || 'Not found'}`, 'success');
    addLog(`Likes: ${data.likes || 0}`, 'success');
    if (data.maps) {
      // Results not named like the reel's place (a nearby business Maps adds) are left out.
      const candidates = relatedPlaces(data.maps.candidates, reelPlaceHints(data))
        .map((candidate) => ({ ...candidate, searchQuery: data.maps.query }));
      if (data.maps.details) {
        setMapsData(data.maps.details);
        setName(data.maps.details.name || data.placeName || name);
        setLocation(data.maps.details.address || data.location || '');
        addLog(`Google Maps matched ${data.maps.details.name}.`, 'success');
        addLog(`Address: ${data.maps.details.address || 'Not listed'}`, 'success');
      } else if (!(data.listedPlaces?.length > 1) && bestPlaceMatch(candidates, reelPlaceHints(data))) {
        // (Not for a list post shared without a slide: the person says which place they meant.)
        // One result, or one whose name matches the reel's place: pick it without asking.
        const best = bestPlaceMatch(candidates, reelPlaceHints(data));
        addLog(`Picked ${best.name}, the clear match.`, 'success');
        selectLocationCandidate(best);
      } else if (candidates.length) {
        setLocationCandidates(candidates);
        setLocationSearchDone(true);
        addLog(`Searched with: "${data.maps.query}"`, 'info');
        addLog(`Found ${candidates.length} Google Maps match${candidates.length === 1 ? '' : 'es'}; choose the right place below.`, 'success');
      } else if (data.maps.error) {
        addLog(`Google Maps: ${data.maps.error}`, 'error');
      }
    }
  };

  const requestLocationApi = async (payload) => {
    const response = await fetch('/api/scrape-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(55000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Google Maps returned HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const selectLocationCandidate = async (candidate, preserveName = false) => {
    setLoadingCandidateUrl(candidate.url);
    try {
      const data = await requestLocationApi({
        action: 'details',
        query: candidate.searchQuery,
        placeUrl: candidate.url,
        placeAddress: candidate.address,
        placeName: candidate.name,
        location: candidate.address || location || scrapedData?.location || '',
      });
      setMapsData(data);
      if (!preserveName || !nameTypedRef.current || !name.trim()) setName(data.name || candidate.name);
      setLocation(data.address || candidate.address || location);
      setLocationCandidates([]);
      setLocationSearchDone(false);
      setVerifyResults(null);
      setVerifyCandidate(null);
      addLog(`Selected ${data.name}; scraped its place details.`, 'success');
      addLog(`Address: ${data.address || 'Not listed'}`, 'success');
      addLog(`Google Maps: ${data.mapsUrl || candidate.url}`, 'success');
    } catch (error) {
      addLog(`Could not fetch selected place: ${error.message}`, 'error');
    } finally {
      setLoadingCandidateUrl(null);
    }
  };

  // A place tapped in "This post lists N places": fill the form with it and find it on Google Maps.
  const chooseListed = async (item) => {
    nameTypedRef.current = false;
    setName(item.name);
    setLocation(item.address || '');
    setMapsData(null);
    setPinCoords(null);
    setLocationCandidates([]);
    setLocationSearchDone(false);
    setChoosingListed(item.line);
    try {
      const query = [item.name, item.address, scrapedData?.area].filter(Boolean).join(', ');
      const candidates = relatedPlaces(await searchCandidates(query), [item.name])
        .map((candidate) => ({ ...candidate, searchQuery: query }));
      const best = bestPlaceMatch(candidates, [item.name]);
      if (best) {
        await selectLocationCandidate(best);
      } else {
        setLocationCandidates(candidates);
        setLocationSearchDone(true);
      }
    } catch (error) {
      addLog(`Could not find ${item.name}: ${error.message}`, 'error');
    } finally {
      setChoosingListed(null);
    }
  };

  // "Add all" on a list post: every listed place is looked up on Google Maps and saved to the chosen
  // collection. A place Maps can't match is saved with the address from the post and no map pin.
  const addAllListed = async () => {
    if (!collectionId || !onAddAll || !scrapedData?.listedPlaces?.length) return;
    setAddingAllListed(true);
    setSaving(true);
    const places = [];
    try {
      for (const item of scrapedData.listedPlaces) {
        addLog(`Looking up ${item.name}…`, 'info');
        const query = [item.name, item.address, scrapedData?.area].filter(Boolean).join(', ');
        const candidates = (await searchCandidates(query)).map((candidate) => ({ ...candidate, searchQuery: query }));
        const best = bestPlaceMatch(candidates, [item.name]);
        let venueDetails = null;
        if (best) {
          venueDetails = await requestLocationApi({
            action: 'details',
            query,
            placeUrl: best.url,
            placeAddress: best.address,
            placeName: best.name,
            location: best.address || item.address || scrapedData?.area || '',
          });
        }
        places.push({
          name: (venueDetails?.name || best?.name || item.name).trim(),
          location: (venueDetails?.address || best?.address || item.address || '').trim(),
          category,
          collectionId,
          reelUrl: reelUrl.trim(),
          venueDetails,
          feeling,
          customInfo: customInfo.trim(),
          url: null,
          eventDate: null,
        });
      }
      await onAddAll(places);
    } catch (error) {
      addLog(`Could not add all places: ${error.message}`, 'error');
    } finally {
      setAddingAllListed(false);
      setSaving(false);
    }
  };

  // "No results" from the server (404) is an empty list, not an error.
  const searchCandidates = async (query) => {
    try {
      const data = await requestLocationApi({ action: 'search', query, location: query });
      return data.candidates || [];
    } catch (error) {
      if (error.status === 404) return [];
      throw error;
    }
  };

  const verifyLocation = async () => {
    const address = location.trim();
    const placeName = name.trim();
    if (!address) return;
    setVerifyingLocation(true);
    setVerifyCandidate(null);
    setVerifyResults(null);
    try {
      // Name + address first. If Google finds nothing, retry with the address alone.
      let candidates = placeName ? await searchCandidates(`${placeName}, ${address}`) : [];
      if (!candidates.length) candidates = await searchCandidates(address);
      // One result, or one whose name matches the name or the address's first part: use it straight away.
      const best = bestPlaceMatch(candidates, [placeName, address.split(',')[0]]);
      if (best) {
        await selectLocationCandidate({ ...best, searchQuery: address }, true);
        return;
      }
      setVerifyResults(relatedPlaces(candidates, [placeName]));
    } catch (error) {
      addLog(`Could not verify address: ${error.message}`, 'error');
      setVerifyResults(null);
    } finally {
      setVerifyingLocation(false);
    }
  };

  // New collections are public (the database default) and use the default 📌 icon.
  // On success the new collection is selected for this place.
  const createNewCollection = async (event) => {
    event.preventDefault();
    const trimmed = newCollectionName.trim();
    if (!trimmed || creatingCollection) return;
    setCreatingCollection(true);
    const newId = await onCreateCollection(trimmed);
    setCreatingCollection(false);
    if (typeof newId === 'string') {
      setCollectionId(newId);
      setNewCollectionOpen(false);
      setNewCollectionName('');
    }
  };

  const handleConfirmReel = () => {
    const trimmedUrl = reelUrlInput.trim();
    setUrlError('');

    if (!trimmedUrl) {
      setUrlError('Please paste an Instagram or TikTok link');
      return;
    }

    if (!isValidReelUrl(trimmedUrl)) {
      setUrlError('Invalid link. Use an instagram.com/reel/ or /p/ link, or a tiktok.com/@user/video/ link');
      return;
    }

    // URL is valid, proceed to step 2
    setReelUrl(trimmedUrl);
    setMapsData(null);
    scrapeReel(trimmedUrl);
    setTimeout(() => setStep('details'), 300);
  };

  // A link shared from Instagram or TikTok goes straight to the lookup, with no extra tap.
  // When the background lookup already ran (Finish on a saved reel), its results fill the form instead.
  useEffect(() => {
    if (initialReelUrl && initialReelData) {
      setReelUrl(initialReelUrl);
      applyReelData(initialReelData);
      setStep('details');
    } else if (initialReelUrl) handleConfirmReel();
    // Runs once when the sheet opens with a shared link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSkipReel = () => {
    setReelUrl('');
    setScrapedData(null);
    setMapsData(null);
    setStep('details');
  };

  // confirmedDuplicate is true when the user has already chosen "Yes, add it" on the warning.
  const submit = async (e, confirmedDuplicate = false) => {
    e?.preventDefault();
    if (!name.trim() || !collectionId) return;
    // Reel adds have no link field; the reel itself is the link.
    const link = reelUrl ? '' : normaliseEntryUrl(entryUrl);
    if (link === null) {
      setEntryUrlError('Enter a valid web link, for example https://example.com');
      return;
    }
    setEntryUrlError('');
    setSaving(true);

    try {
      // Google place first, then the spot tapped on the map. Mapbox is only a fallback.
      let venueDetails = mapsData ?? pinCoords;
      if (!mapsData && pinCoords) addLog('Using the spot you tapped on the map.', 'info');
      if (location.trim() && (!Number.isFinite(venueDetails?.latitude) || !Number.isFinite(venueDetails?.longitude))) {
        if (!MAPBOX_TOKEN) {
          addLog('Mapbox token is missing; saved address will not have a map pin.', 'error');
        } else {
          addLog(`Finding map coordinates for: ${name.trim()}, ${location.trim()}`, 'info');
          try {
            const query = [name.trim(), location.trim()].filter(Boolean).join(', ');
            const geocodeUrl = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
            geocodeUrl.searchParams.set('access_token', MAPBOX_TOKEN);
            geocodeUrl.searchParams.set('limit', '1');
            geocodeUrl.searchParams.set('types', 'address,poi');
            const response = await fetch(geocodeUrl, { signal: AbortSignal.timeout(12000) });
            if (!response.ok) throw new Error(`Mapbox geocoding returned HTTP ${response.status}`);

            const result = await response.json();
            const feature = result.features?.[0];
            if (feature?.center?.length === 2) {
              venueDetails = {
                ...venueDetails,
                latitude: feature.center[1],
                longitude: feature.center[0],
                address: venueDetails?.address || location.trim(),
                name: venueDetails?.name || name.trim(),
                source: 'mapbox',
              };
              addLog(`Coordinates: ${feature.center[1].toFixed(5)}, ${feature.center[0].toFixed(5)} (${feature.place_name || feature.text || 'Mapbox result'})`, 'success');
            } else {
              addLog('No coordinates found. Place will save without a map pin; add a full street address and try again.', 'error');
            }
          } catch (error) {
            addLog(`Address geocoding failed: ${error.message}. Place will save without a map pin.`, 'error');
          }
        }
      }

      // Warn only when this collection already has the location. Other collections don't count.
      const matches = Number.isFinite(venueDetails?.latitude) && Number.isFinite(venueDetails?.longitude)
        ? entriesAtSpot(places.filter((place) => place.collection_id === collectionId), venueDetails.latitude, venueDetails.longitude)
        : [];
      if (matches.length && !confirmedDuplicate) {
        addLog(`This collection already has ${matches.length === 1 ? 'this location' : `${matches.length} places at this location`}. Waiting for you to confirm.`, 'info');
        setDuplicates(matches);
        return;
      }

      addLog('Saving place…', 'info');
      const collectionName = collections.find((c) => c.id === collectionId)?.name ?? collectionId;
      addLog(`Saving to "${collectionName}": ${JSON.stringify({
        name: name.trim(),
        category,
        address: location.trim() || null,
        lat: venueDetails?.latitude ?? null,
        lng: venueDetails?.longitude ?? null,
        phone: venueDetails?.phone ?? null,
        bookingUrl: venueDetails?.bookingUrl ?? null,
        hours: venueDetails?.hours?.length ? venueDetails.hours : null,
        reelUrl: reelUrl.trim() || null,
        source: venueDetails?.source || (venueDetails ? 'google_maps' : 'manual'),
        vibe: feeling,
        customInfo: customInfo.trim() || null,
        url: link || null,
      })}`, 'info');
      await onAdd({
        name: name.trim(),
        location: location.trim(),
        category,
        collectionId,
        reelUrl: reelUrl.trim(),
        venueDetails,
        feeling,
        customInfo: customInfo.trim(),
        url: link,
        eventDate: category === 'event' ? eventDate || null : null,
      });
      if (draftable) clearDraft();
    } catch (error) {
      addLog(`Could not save place: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={sheetRef}
        className="modal edit-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={sheetTitle}
      >
        <div className="sheet-handle" aria-hidden="true" {...sheetDrag} />
        <div className="modal-header">
          <div className="modal-title">{sheetTitle}</div>
          {step === 'details' && (
            <button
              type="button"
              className="modal-close"
              onClick={() => { setReportOpen((open) => !open); setReportStatus(''); }}
              aria-label="Report a problem with this lookup"
              title="Report a problem with this lookup"
            >
              <TriangleAlert aria-hidden="true" />
            </button>
          )}
          {/* The X discards the draft. Clicking outside, Escape or dragging down keeps it. */}
          <button
            type="button"
            className="modal-close"
            onClick={() => {
              if (draftable) clearDraft();
              onClose();
            }}
            aria-label="Close"
          >
            <X aria-hidden="true" />
          </button>
        </div>

        {reportOpen && (
          <div className="field" style={{ marginBottom: 12 }}>
            <span className="modal-label">Report this lookup</span>
            <textarea
              value={reportComment}
              onChange={(e) => setReportComment(e.target.value)}
              placeholder="What went wrong? (optional)"
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <button
              type="button"
              disabled={reportStatus === 'sending'}
              onClick={async () => {
                setReportStatus('sending');
                try {
                  const response = await fetch('/api/report-lookup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      reelUrl: reelUrl || reelUrlInput.trim(),
                      caption: scrapedData?.caption || '',
                      creator: scrapedData?.creator || '',
                      locationTag: scrapedData?.locationTag || '',
                      placeName: name,
                      location,
                      venue: scrapedData?.venue || '',
                      query: mapsData?.query || '',
                      candidates: mapsData?.candidates || [],
                      comment: reportComment,
                    }),
                  });
                  if (!response.ok) throw new Error(`HTTP ${response.status}`);
                  setReportStatus('sent');
                  setReportComment('');
                } catch {
                  setReportStatus('failed');
                }
              }}
            >
              {reportStatus === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            {reportStatus === 'sent' && <span> Sent, thank you.</span>}
            {reportStatus === 'failed' && <span> Could not send. Try again.</span>}
          </div>
        )}

        {/* STEP 1: Reel Link Input */}
        {step === 'reel' && (
          <div>
            <div className="field">
              <span className="modal-label">Reel link (optional)</span>
              <input
                className="step-input"
                type="url"
                inputMode="url"
                value={reelUrlInput}
                onChange={(e) => {
                  setReelUrlInput(e.target.value);
                  setUrlError('');
                }}
                placeholder="Instagram reel or TikTok video link…"
                disabled={loading}
                autoFocus
              />
              {urlError && (
                <span style={{ fontSize: '12px', color: 'var(--danger-text)', marginTop: '4px', display: 'block' }}>
                  <TriangleAlert className="ico" aria-hidden="true" /> {urlError}
                </span>
              )}
            </div>

            {/* Loading State with Skeleton */}
            {loading && (
              <div style={{
                padding: '12px',
                backgroundColor: 'var(--surface-muted)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Fetching reel data…
                </div>
                <div role="status" aria-label="Fetching reel data" style={{ marginBottom: '8px' }}>
                  <span className="skeleton-bar" style={{ width: '70%' }} />
                  <span className="skeleton-bar" style={{ width: '45%' }} />
                  <span className="skeleton-bar" style={{ width: '90%' }} />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{
                    width: '60px',
                    height: '60px',
                    backgroundColor: 'var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    animation: 'pulse 2s infinite'
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{
                      height: '12px',
                      backgroundColor: 'var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      marginBottom: '8px',
                      width: '80%',
                      animation: 'pulse 2s infinite'
                    }} />
                    <div style={{
                      height: '10px',
                      backgroundColor: 'var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      width: '60%',
                      animation: 'pulse 2s infinite'
                    }} />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                className="step-btn full-width"
                onClick={handleSkipReel}
                disabled={loading}
              >
                Manual
              </button>
              <button
                type="button"
                className="step-btn primary full-width"
                onClick={handleConfirmReel}
                disabled={loading || !reelUrlInput.trim()}
              >
                {loading ? <><span className="spinner" aria-hidden="true" />Loading…</> : 'Confirm'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Place Details */}
        {step === 'details' && (
          <form onSubmit={submit}>
            {/* Reel Thumbnail Preview */}
            {scrapedData && (
              <div style={{
                padding: '12px',
                backgroundColor: 'var(--surface-muted)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '16px',
                display: 'flex',
                gap: '12px',
                alignItems: 'center'
              }}>
                {/* Instagram and TikTok reels show the platform's own embed in the app's frame; others the cover. */}
                {reelEmbed(reelUrl) ? (
                  <button
                    type="button"
                    className="reel-thumb-btn"
                    aria-label="Open reel"
                    onClick={() => window.open(reelUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <ReelEmbedThumb reelUrl={reelUrl} className="pin-thumbnail" />
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="Open reel"
                    onClick={() => window.open(reelUrl, '_blank', 'noopener,noreferrer')}
                    style={{
                    width: '60px',
                    height: '60px',
                    backgroundColor: 'var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    flexShrink: 0,
                    border: 0,
                    padding: 0,
                    cursor: reelUrl ? 'pointer' : 'default',
                    }}
                    disabled={!reelUrl}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: '500',
                    color: 'var(--text)',
                    marginBottom: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {scrapedData.unreadable ? "Couldn't read this reel · pick the place" : scrapedData.location || 'Location from reel'}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)'
                  }}>
                    {scrapedData.likes != null && <><Heart className="ico" aria-hidden="true" /> {Number(scrapedData.likes).toLocaleString()}</>}
                    {scrapedData.likes != null && scrapedData.comments != null && ' · '}
                    {scrapedData.comments != null && <><MessageCircle className="ico" aria-hidden="true" /> {Number(scrapedData.comments).toLocaleString()}</>}
                    {/* The quick lookup has no counts, so the creator is shown instead. */}
                    {!scrapedData.unreadable && scrapedData.likes == null && scrapedData.comments == null && (scrapedData.creator ? `@${scrapedData.creator}` : 'Counts unavailable')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const query = [name || scrapedData.placeName, location || scrapedData.location].filter(Boolean).join(' ');
                    const mapsUrl = mapsData?.mapsUrl || `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
                    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
                  }}
                  title="Open Google Maps location"
                  aria-label="Open Google Maps location"
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '18px',
                    cursor: 'pointer',
                    padding: '4px',
                    flexShrink: 0,
                    opacity: 0.7,
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '1'}
                  onMouseLeave={(e) => e.target.style.opacity = '0.7'}
                >
                  <ArrowUpRight className="ico" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* A list post shared without a slide: which of its places is this? */}
            {scrapedData?.listedPlaces?.length > 1 && (
              <div className="field">
                <span className="modal-label">This post lists {scrapedData.listedPlaces.length} places. Which one?</span>
                <div className="listed-places">
                  {scrapedData.listedPlaces.map((item) => (
                    <button
                      key={item.line}
                      type="button"
                      className={`listed-place ${name === item.name ? 'is-on' : ''}`}
                      aria-pressed={name === item.name}
                      onClick={() => chooseListed(item)}
                      disabled={saving || !!choosingListed || !!loadingCandidateUrl}
                    >
                      <strong>{choosingListed === item.line ? <><span className="spinner" aria-hidden="true" />{item.name}</> : item.name}</strong>
                      {item.address && <span>{item.address}</span>}
                    </button>
                  ))}
                </div>
                {onAddAll && (
                  <button
                    type="button"
                    className="step-btn primary full-width"
                    onClick={addAllListed}
                    disabled={saving || !!choosingListed || addingAllListed || !collectionId}
                  >
                    {addingAllListed ? 'Adding…' : `Add all ${scrapedData.listedPlaces.length} as places`}
                  </button>
                )}
              </div>
            )}

            {/* Name Field */}
            <label className="field">
              <span className="modal-label">Name *</span>
              <input
                className="step-input"
                value={name}
                onChange={(e) => {
                  nameTypedRef.current = true;
                  setName(e.target.value);
                  setMapsData(null);
                  setLocationCandidates([]);
                  setLocationSearchDone(false);
                }}
                placeholder="e.g. Wine & Wild"
                maxLength={80}
                required
                disabled={saving}
              />
            </label>

            {/* Address: the input and Verify sit on one row, with a hint underneath */}
            <div className="field">
              <span className="modal-label">Address</span>
              <div className="address-row">
                <input
                  className="step-input"
                  aria-label="Address"
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    setMapsData(null);
                    setPinCoords(null);
                    setLocationCandidates([]);
                    setLocationSearchDone(false);
                  }}
                  placeholder="Street address, suburb, city"
                  maxLength={100}
                  disabled={saving}
                />
                <button
                  type="button"
                  className="step-btn secondary"
                  onClick={verifyLocation}
                  disabled={saving || loading || verifyingLocation || !location.trim() || !!loadingCandidateUrl}
                >
                  {verifyingLocation ? <><span className="spinner" aria-hidden="true" />Searching…</> : 'Verify'}
                </button>
              </div>
              <span className="field-hint">Used for the map pin. Verify to pick the exact Google Maps place.</span>
            </div>

            {locationCandidates.length > 0 && (
              <div role="group" aria-label="Google Maps matches" style={{ margin: '-8px 0 16px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Choose the right place ({locationCandidates.length} found):
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {locationCandidates.map((candidate) => (
                    <button
                      key={candidate.url}
                      type="button"
                      onClick={() => selectLocationCandidate(candidate)}
                      disabled={saving || !!loadingCandidateUrl}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        textAlign: 'left',
                        cursor: loadingCandidateUrl ? 'wait' : 'pointer',
                      }}
                    >
                      <strong style={{ display: 'block', fontSize: '14px' }}>
                        {loadingCandidateUrl === candidate.url ? <span className="skeleton-bar" style={{ width: '60%' }} aria-label="Loading details" /> : candidate.name}
                      </strong>
                      <span style={{ display: 'block', marginTop: '3px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        {[candidate.address, candidate.category, candidate.rating && `★ ${candidate.rating}`]
                          .filter(Boolean).join(' · ') || candidate.summary || 'Google Maps place'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {locationSearchDone && locationCandidates.length === 0 && (
              <div role="status" style={{ margin: '-8px 0 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                No matches. Try editing the address or enter place details manually.
              </div>
            )}
            {location.trim() && !mapsData && !pinCoords && (
              <div role="note" style={{ margin: '-8px 0 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                No Google Maps place selected. The map pin will be approximate.
              </div>
            )}

            {mapsData?.hours?.length > 0 && (
              <details style={{ margin: '-8px 0 16px', fontSize: '13px' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text)', fontWeight: '500' }}>Opening hours</summary>
                <ul style={{ listStyle: 'none', padding: '8px 0 0', margin: 0, display: 'grid', gap: '4px' }}>
                  {mapsData.hours.map((row, index) => (
                    <li key={`${row.days}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: 'var(--text-muted)' }}>
                      <span>{row.days}</span>
                      <span>{row.time}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {(verifyingLocation || verifyResults) && (
              <div className="modal-overlay location-verify-overlay" onClick={(e) => { e.stopPropagation(); setVerifyResults(null); }}>
                <div className="modal location-verify-modal" role="dialog" aria-label="Verify location" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <div className="modal-title">Confirm location</div>
                    <button type="button" className="modal-close" onClick={() => setVerifyResults(null)} aria-label="Close"><X aria-hidden="true" /></button>
                  </div>
                  {verifyingLocation ? (
                    <div role="status" aria-label="Searching Google Maps">
                      <div className="modal-label" style={{ marginBottom: '8px' }}>Searching Google Maps…</div>
                      {[0, 1, 2].map((i) => <div key={i} className="skeleton-card" />)}
                    </div>
                  ) : verifyResults.length ? (
                    <>
                      <p className="modal-label">Choose the matching Google Maps place.</p>
                      <div className="location-verify-results">
                        {verifyResults.map((candidate) => (
                          <button
                            key={candidate.url}
                            type="button"
                            className={`location-verify-result ${verifyCandidate?.url === candidate.url ? 'selected' : ''}`}
                            onClick={() => setVerifyCandidate(candidate)}
                          >
                            <strong>{candidate.name}</strong>
                            <span>{candidate.address || candidate.summary || 'Address not listed'}</span>
                          </button>
                        ))}
                      </div>
                      <div className="field-row">
                        <button type="button" className="step-btn secondary full-width" onClick={() => setVerifyResults(null)}>Cancel</button>
                        <button
                          type="button"
                          className="step-btn primary full-width"
                          disabled={!verifyCandidate || !!loadingCandidateUrl}
                          onClick={() => selectLocationCandidate({ ...verifyCandidate, searchQuery: location.trim() }, true)}
                        >
                          {loadingCandidateUrl ? <><span className="spinner" aria-hidden="true" />Loading details…</> : 'Confirm place'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>No Google Maps matches. Check the address and try again.</p>
                      <button type="button" className="step-btn secondary full-width" onClick={() => setVerifyResults(null)}>Close</button>
                    </>
                  )}
                </div>
              </div>
            )}

            {newCollectionOpen && (
              <div
                className="modal-overlay location-verify-overlay"
                onClick={() => !creatingCollection && setNewCollectionOpen(false)}
              >
                {/* A div, not a form: this sits inside the add-place form, and a nested form submits the outer one. */}
                <div
                  className="modal location-verify-modal"
                  role="dialog"
                  aria-label="New collection"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="modal-header">
                    <div className="modal-title">New collection</div>
                  </div>
                  <label className="field">
                    <span className="modal-label">Name</span>
                    <input
                      className="step-input"
                      value={newCollectionName}
                      onChange={(e) => setNewCollectionName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') createNewCollection(e); }}
                      placeholder="e.g. Date nights"
                      maxLength={40}
                      autoFocus
                      disabled={creatingCollection}
                      required
                    />
                  </label>
                  <div className="field-row">
                    <button
                      type="button"
                      className="step-btn secondary full-width"
                      onClick={() => setNewCollectionOpen(false)}
                      disabled={creatingCollection}
                    >
                      Cancel
                    </button>
                    <button type="button" className="step-btn primary full-width" onClick={createNewCollection} disabled={creatingCollection}>
                      {creatingCollection ? <><span className="spinner" aria-hidden="true" />Creating…</> : 'OK'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Custom info and link for this entry. Optional, shown on the pin. */}
            <label className="field">
              <span className="modal-label">Custom info (optional)</span>
              <input
                className="step-input"
                value={customInfo}
                onChange={(e) => setCustomInfo(e.target.value)}
                placeholder="e.g. Pottery class"
                maxLength={120}
                disabled={saving}
              />
            </label>
            {/* A reel is already a link, so the link field only appears for manual adds. */}
            {!reelUrl && (
              <label className="field">
                <span className="modal-label">Link (optional)</span>
                <input
                  className="step-input"
                  type="text"
                  inputMode="url"
                  value={entryUrl}
                  onChange={(e) => {
                    setEntryUrl(e.target.value);
                    setEntryUrlError('');
                  }}
                  placeholder="https://"
                  disabled={saving}
                />
                {entryUrlError && (
                  <span style={{ fontSize: '12px', color: 'var(--danger-text)', marginTop: '4px', display: 'block' }}>
                    <TriangleAlert className="ico" aria-hidden="true" /> {entryUrlError}
                  </span>
                )}
              </label>
            )}

            {/* Same location already saved: confirm before adding another entry there. */}
            {duplicates.length > 0 && (
              <DuplicateWarning
                matches={duplicates}
                title="This collection already has this location"
                question="Add this location again as a new place?"
                confirmLabel="Yes, add it"
                onCancel={() => setDuplicates([])}
                onConfirm={() => {
                  setDuplicates([]);
                  submit(null, true);
                }}
              />
            )}

            {/* Collection & Category */}
            <div className="field-row">
              <label className="field">
                <span className="modal-label">Collection</span>
                <select
                  className="step-input"
                  value={collectionId}
                  onChange={(e) => {
                    if (e.target.value === NEW_COLLECTION) setNewCollectionOpen(true);
                    else setCollectionId(e.target.value);
                  }}
                  disabled={saving}
                >
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.name}
                    </option>
                  ))}
                  <option value={NEW_COLLECTION}>+ New collection</option>
                </select>
              </label>
              <label className="field">
                <span className="modal-label">Category</span>
                <select
                  className="step-input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={saving}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {category === 'event' && eventDatesReady && (
              <label className="field">
                <span className="modal-label">Event date (optional)</span>
                <input
                  className="step-input"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  disabled={saving}
                />
              </label>
            )}

            {/* Vibe/Feeling */}
            <div className="field">
              <span className="modal-label">Your vibe</span>
              <div className="segmented wide" role="radiogroup" aria-label="Your vibe">
                {feelings.map((f) => (
                  <button
                    type="button"
                    key={f.id}
                    role="radio"
                    aria-checked={feeling === f.id}
                    className={`segment ${feeling === f.id ? 'selected' : ''}`}
                    onClick={() => setFeeling(f.id)}
                    disabled={saving}
                  >
                    {f.emoji} <span className="segment-label">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <button type="submit" className="step-btn primary full-width" disabled={saving || !name.trim()}>
              {saving ? <><span className="spinner" aria-hidden="true" />Adding…</> : 'Add place'}
            </button>
          </form>
        )}

        {/* API Logs Console - Always Visible */}
        {apiLogs.length > 0 && (
          <div style={{
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid var(--border)'
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '500',
              color: 'var(--text-muted)',
              marginBottom: '8px'
            }}>
              API Logs
            </div>
            <div style={{
              padding: '10px',
              backgroundColor: '#1a1a1a',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'monospace',
              fontSize: '12px',
              maxHeight: '150px',
              overflowY: 'auto',
              overflowX: 'hidden',
              color: '#0f0'
            }}>
              {apiLogs.map((log, idx) => (
                <div key={idx} style={{
                  padding: '3px 0',
                  color: log.type === 'error' ? '#ff6b6b' : log.type === 'success' ? '#51cf66' : '#a0aec0',
                  borderBottom: '1px solid #2a2a2a',
                  lineHeight: '1.4',
                  wordBreak: 'break-all'
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>[{log.timestamp}]</span> {log.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
