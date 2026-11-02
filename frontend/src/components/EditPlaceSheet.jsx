import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import useSheetDrag from '../lib/useSheetDrag';
import { categories, categoryIcon } from '../lib/constants';
import { entriesAtSpot } from '../lib/places';
import DuplicateWarning from './DuplicateWarning';
import CandidateAddress from './CandidateAddress';
import PlaceSearchInput from './PlaceSearchInput';
import EventTimesEditor from './EventTimesEditor';
import EmojiPicker from './EmojiPicker';
import { cleanRuns, runsOf } from '../lib/eventRuns';
import { requestLocationApi } from '../lib/googlePlaces';

// Any member can open this to copy the place. Only whoever added it can change its name, emoji, category or collection,
// and not in a collection they only view.
export default function EditPlaceSheet({ place, collections = [], places = [], userId, eventDatesReady = false, canEdit = () => true, onSave, onCopy, onMove, onClose }) {
  const sheetRef = React.useRef(null);
  const sheetDrag = useSheetDrag(sheetRef, onClose);
  const [name, setName] = useState(place.name);
  const [emoji, setEmoji] = useState(place.emoji ?? '');
  const [category, setCategory] = useState(place.category);
  const [eventRuns, setEventRuns] = useState(() => runsOf(place));
  const [eventPrice, setEventPrice] = useState(place.event_price ?? '');
  const [eventContact, setEventContact] = useState(place.event_contact ?? '');
  const [saving, setSaving] = useState(false);
  const [copyTarget, setCopyTarget] = useState('');
  const [moveTarget, setMoveTarget] = useState('');
  const [busyAction, setBusyAction] = useState(null); // 'copy' | 'move' | null
  // Places already in the chosen collection that this one would duplicate, for copy and move.
  const [copyDuplicates, setCopyDuplicates] = useState([]);
  const [moveDuplicates, setMoveDuplicates] = useState([]);
  // Change location: the search text, and the new spot once one is picked
  // ({ lat, lng, address, hours, phone, bookingUrl, mapsUrl }). null keeps the current spot.
  const [locationText, setLocationText] = useState(place.address ?? '');
  const [newSpot, setNewSpot] = useState(null);
  // True once the name is typed in, so picking a new spot doesn't replace it.
  const nameTypedRef = React.useRef(false);
  // "Search Google Maps" for a place Mapbox doesn't list: null | 'searching' | candidates[].
  const [googleResults, setGoogleResults] = useState(null);
  const [loadingGoogleUrl, setLoadingGoogleUrl] = useState(null);
  const [locationError, setLocationError] = useState('');
  // Places already at the new spot in this collection, shown before saving.
  const [spotDuplicates, setSpotDuplicates] = useState([]);

  const placeIn = place.collectionIds ?? [];
  // Places can only go into collections I can change.
  const copyOptions = collections.filter((c) => !placeIn.includes(c.id) && canEdit(c.id));
  const moveOptions = collections.filter((c) => c.id !== place.collection_id && canEdit(c.id));
  const isViewer = !canEdit(place.collection_id);
  const isAdder = place.added_by === userId && !isViewer;
  const canMove = isAdder;

  const runCopy = async (confirmed = false) => {
    if (!confirmed) {
      const matches = findDuplicatesIn(copyTarget);
      if (matches.length) {
        setCopyDuplicates(matches);
        return;
      }
    }
    setBusyAction('copy');
    const ok = await onCopy(copyTarget);
    setBusyAction(null);
    if (ok) setCopyTarget('');
  };

  // Same check as adding a place: the same place, or the same spot, already in that collection.
  const findDuplicatesIn = (collectionId) => {
    const inTarget = places.filter((p) => p.collection_id === collectionId);
    const sameSpot = Number.isFinite(place.lat) && Number.isFinite(place.lng)
      ? entriesAtSpot(inTarget, place.lat, place.lng)
      : [];
    const samePlace = inTarget.filter((p) => p.id === place.id);
    return [...new Map([...samePlace, ...sameSpot].map((p) => [p.id, p])).values()];
  };

  const runMove = async (confirmed = false) => {
    if (!confirmed) {
      const matches = findDuplicatesIn(moveTarget);
      if (matches.length) {
        setMoveDuplicates(matches);
        return;
      }
    }
    setBusyAction('move');
    const ok = await onMove(moveTarget);
    setBusyAction(null);
    if (ok) onClose();
  };

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A new spot picked from either search. A business's name replaces the place's name unless it was typed.
  const pickSpot = (spot, placeName) => {
    setNewSpot(spot);
    setLocationText(spot.address);
    setGoogleResults(null);
    setLocationError('');
    if (placeName && !nameTypedRef.current) setName(placeName);
  };

  const searchGoogle = async () => {
    const query = [name.trim(), locationText.trim()].filter(Boolean).join(', ');
    if (!query) return;
    setGoogleResults('searching');
    setLocationError('');
    try {
      const data = await requestLocationApi({ action: 'search', query, location: query });
      setGoogleResults((data.candidates || []).map((candidate) => ({ ...candidate, searchQuery: query })));
    } catch (error) {
      if (error.status === 404) setGoogleResults([]);
      else {
        setGoogleResults(null);
        setLocationError(`Google Maps search failed: ${error.message}`);
      }
    }
  };

  const pickGoogle = async (candidate) => {
    setLoadingGoogleUrl(candidate.url);
    try {
      const data = await requestLocationApi({
        action: 'details',
        query: candidate.searchQuery,
        placeUrl: candidate.url,
        placeAddress: candidate.address,
        placeName: candidate.name,
        location: candidate.address || '',
      });
      if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) throw new Error('Google Maps had no map pin for it');
      pickSpot({
        lat: data.latitude,
        lng: data.longitude,
        address: data.address || candidate.address || '',
        hours: data.hours?.length ? data.hours : null,
        phone: data.phone || null,
        bookingUrl: data.bookingUrl || null,
        mapsUrl: data.mapsUrl || candidate.url,
      }, data.name || candidate.name);
    } catch (error) {
      setLocationError(`Couldn't load that place: ${error.message}`);
    } finally {
      setLoadingGoogleUrl(null);
    }
  };

  // confirmedDuplicate is true once "Yes, move it" was chosen on the warning.
  const save = async (e, confirmedDuplicate = false) => {
    e?.preventDefault();
    if (!name.trim()) return;
    if (newSpot && !confirmedDuplicate) {
      const matches = entriesAtSpot(places.filter((p) => p.collection_id === place.collection_id && p.id !== place.id), newSpot.lat, newSpot.lng);
      if (matches.length) {
        setSpotDuplicates(matches);
        return;
      }
    }
    setSaving(true);
    await onSave({ name: name.trim(), emoji: emoji.trim(), category, eventRuns: cleanRuns(eventRuns), eventPrice, eventContact, location: newSpot });
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form
        ref={sheetRef}
        className="modal edit-sheet"
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
        role="dialog"
        aria-label={`Edit ${place.name}`}
      >
        <div className="sheet-handle" aria-hidden="true" {...sheetDrag} />
        <div className="modal-header">
          <div className="modal-title">Edit place</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </div>

        {isViewer ? (
          <p className="place-collection-note">You're a viewer here, so you can't change this place. You can still copy it to your collections.</p>
        ) : !isAdder && (
          <p className="place-collection-note">Only the person who added this place can change it. You can still copy it to your collections.</p>
        )}

        <label className="field">
          <span className="modal-label">Name</span>
          <input
            className="step-input"
            value={name}
            onChange={(e) => {
              nameTypedRef.current = true;
              setName(e.target.value);
            }}
            placeholder="Place name"
            maxLength={80}
            required
            disabled={!isAdder}
          />
        </label>

        <div className="field">
          <span className="modal-label">Location</span>
          {isAdder ? (
            <>
              <PlaceSearchInput
                ariaLabel="Location"
                value={locationText}
                onChange={(text) => {
                  setLocationText(text);
                  setNewSpot(null);
                  setGoogleResults(null);
                }}
                onPick={(picked) => pickSpot(
                  { lat: picked.lat, lng: picked.lng, address: picked.address, mapsUrl: null },
                  // An address or suburb has no name of its own, so it doesn't rename the place.
                  picked.name && !picked.address.startsWith(picked.name) ? picked.name : null,
                )}
                near={Number.isFinite(place.lng) && Number.isFinite(place.lat) ? [place.lng, place.lat] : null}
                placeholder="Search a place or street address"
                maxLength={100}
                disabled={saving}
              />
              {googleResults === 'searching' && (
                <div className="map-search-results place-search-results" role="status" aria-label="Searching Google Maps">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="map-search-result" aria-hidden="true">
                      <span className="skeleton-bar" style={{ width: '70%' }} />
                      <span className="skeleton-bar" style={{ width: '45%', height: '10px' }} />
                    </div>
                  ))}
                </div>
              )}
              {Array.isArray(googleResults) && (googleResults.length ? (
                <div className="map-search-results place-search-results" role="group" aria-label="Google Maps matches">
                  {googleResults.map((candidate) => (
                    <button key={candidate.url} type="button" className="map-search-result" disabled={!!loadingGoogleUrl} onClick={() => pickGoogle(candidate)}>
                      <strong>{loadingGoogleUrl === candidate.url ? 'Loading…' : candidate.name}</strong>
                      <span><CandidateAddress candidate={candidate} /></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="map-search-note place-search-note" role="status">No Google Maps matches. Try a different name or address.</div>
              ))}
              {locationError && <div className="map-search-note place-search-note" role="alert">{locationError}</div>}
              <span className="field-hint">
                {newSpot
                  ? 'New spot picked. Save to move it there for this collection only.'
                  : <>Search to move this place to the right spot. Not listed?{' '}
                    <button type="button" className="link-btn" onClick={searchGoogle} disabled={saving || googleResults === 'searching' || !(name.trim() || locationText.trim())}>
                      <strong>Search Google Maps</strong>
                    </button></>}
              </span>
            </>
          ) : (
            <div className="place-collection-note">{place.address || 'No address saved'}</div>
          )}
        </div>

        <div className="field">
          <span className="modal-label">Emoji (optional)</span>
          <EmojiPicker
            value={emoji}
            onChange={setEmoji}
            placeholder={categoryIcon(category)}
            label="Place emoji"
            noneLabel="Use the category icon"
            disabled={!isAdder}
            describedBy="emoji-hint"
          />
          <span id="emoji-hint" className="place-collection-note">Only for this collection. Pick none to use the category icon.</span>
        </div>

        <label className="field">
          <span className="modal-label">Category</span>
          <select className="step-input" value={category} onChange={(e) => setCategory(e.target.value)} disabled={!isAdder}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        {category === 'event' && eventDatesReady && (
          <>
            <EventTimesEditor runs={eventRuns} onChange={setEventRuns} price={eventPrice} onPrice={setEventPrice} contact={eventContact} onContact={setEventContact} disabled={!isAdder} />
            <span className="place-collection-note">Events in the next 3 months show in Up next, and in Today on each day they are on.</span>
          </>
        )}

        <div className="field">
          <span className="modal-label">Collections</span>
          <div className="place-collections">
            {collections.filter((c) => placeIn.includes(c.id)).map((c) => (
              <span key={c.id} className="place-collection-chip">{c.emoji} {c.name}</span>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="modal-label">Copy to another collection</span>
          {copyOptions.length === 0 ? (
            <div className="place-collection-note">It's already in all the collections you can add to.</div>
          ) : (
            <div className="field-row">
              <select className="step-input" value={copyTarget} onChange={(e) => setCopyTarget(e.target.value)} disabled={!!busyAction}>
                <option value="">Choose a collection…</option>
                {copyOptions.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
              <button type="button" className="step-btn secondary" disabled={!copyTarget || !!busyAction} onClick={() => runCopy()}>
                {busyAction === 'copy' ? <><span className="spinner" aria-hidden="true" />Copying…</> : 'Copy'}
              </button>
            </div>
          )}
        </div>

        {canMove && moveOptions.length > 0 && (
          <div className="field">
            <span className="modal-label">Move to another collection (you added this place)</span>
            <div className="field-row">
              <select className="step-input" value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} disabled={!!busyAction}>
                <option value="">Choose a collection…</option>
                {moveOptions.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
              <button type="button" className="step-btn secondary" disabled={!moveTarget || !!busyAction} onClick={() => runMove()}>
                {busyAction === 'move' ? <><span className="spinner" aria-hidden="true" />Moving…</> : 'Move'}
              </button>
            </div>
          </div>
        )}

        {copyDuplicates.length > 0 && (
          <DuplicateWarning
            matches={copyDuplicates}
            title="That collection already has this location"
            question="Copy it there anyway, as a second place?"
            confirmLabel="Yes, copy it"
            onCancel={() => setCopyDuplicates([])}
            onConfirm={() => {
              setCopyDuplicates([]);
              runCopy(true);
            }}
          />
        )}

        {moveDuplicates.length > 0 && (
          <DuplicateWarning
            matches={moveDuplicates}
            title="That collection already has this location"
            question="Move it there anyway, as a second place?"
            confirmLabel="Yes, move it"
            onCancel={() => setMoveDuplicates([])}
            onConfirm={() => {
              setMoveDuplicates([]);
              runMove(true);
            }}
          />
        )}

        {spotDuplicates.length > 0 && (
          <DuplicateWarning
            matches={spotDuplicates}
            title="This collection already has a place there"
            question="Move it there anyway, as a second place?"
            confirmLabel="Yes, move it"
            onCancel={() => setSpotDuplicates([])}
            onConfirm={() => {
              setSpotDuplicates([]);
              save(null, true);
            }}
          />
        )}

        {isAdder && (
          <button type="submit" className="step-btn primary full-width" disabled={saving}>
            {saving ? <><span className="spinner" aria-hidden="true" />Saving…</> : 'Save changes'}
          </button>
        )}
      </form>
    </div>
  );
}
