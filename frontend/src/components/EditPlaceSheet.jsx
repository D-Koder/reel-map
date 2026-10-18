import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import useSheetDrag from '../lib/useSheetDrag';
import { categories, categoryIcon } from '../lib/constants';
import { entriesAtSpot } from '../lib/places';
import DuplicateWarning from './DuplicateWarning';

// Any member can open this to copy the place. Only whoever added it can change its name, emoji, category or collection,
// and not in a collection they only view.
export default function EditPlaceSheet({ place, collections = [], places = [], userId, eventDatesReady = false, eventEndDatesReady = false, canEdit = () => true, onSave, onCopy, onMove, onClose }) {
  const sheetRef = React.useRef(null);
  const sheetDrag = useSheetDrag(sheetRef, onClose);
  const [name, setName] = useState(place.name);
  const [emoji, setEmoji] = useState(place.emoji ?? '');
  const [category, setCategory] = useState(place.category);
  const [eventDate, setEventDate] = useState(place.event_date ?? '');
  const [eventEndDate, setEventEndDate] = useState(place.event_end_date ?? '');
  const [saving, setSaving] = useState(false);
  const [copyTarget, setCopyTarget] = useState('');
  const [moveTarget, setMoveTarget] = useState('');
  const [busyAction, setBusyAction] = useState(null); // 'copy' | 'move' | null
  // Places already in the chosen collection that this one would duplicate, for copy and move.
  const [copyDuplicates, setCopyDuplicates] = useState([]);
  const [moveDuplicates, setMoveDuplicates] = useState([]);

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

  const save = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ name: name.trim(), emoji: emoji.trim(), category, eventDate, eventEndDate });
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
            onChange={(e) => setName(e.target.value)}
            placeholder="Place name"
            maxLength={80}
            required
            disabled={!isAdder}
          />
        </label>

        <label className="field">
          <span className="modal-label">Emoji (optional)</span>
          <input
            className="step-input"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder={categoryIcon(category)}
            maxLength={16}
            disabled={!isAdder}
            aria-describedby="emoji-hint"
          />
          <span id="emoji-hint" className="place-collection-note">Only for this collection. Leave empty for the category icon.</span>
        </label>

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
          <label className="field">
            <span className="modal-label">Event date (optional)</span>
            <input
              className="step-input"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              disabled={!isAdder}
            />
            <span className="place-collection-note">Events in the next 3 months show in Up next.</span>
          </label>
        )}
        {category === 'event' && eventDatesReady && eventEndDatesReady && eventDate && (
          <label className="field">
            <span className="modal-label">Last day (optional)</span>
            <input
              className="step-input"
              type="date"
              value={eventEndDate}
              min={eventDate}
              onChange={(e) => setEventEndDate(e.target.value)}
              disabled={!isAdder}
            />
            <span className="place-collection-note">For pop-ups and events on for several days. It shows in Today on each day.</span>
          </label>
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

        {isAdder && (
          <button type="submit" className="step-btn primary full-width" disabled={saving}>
            {saving ? <><span className="spinner" aria-hidden="true" />Saving…</> : 'Save changes'}
          </button>
        )}
      </form>
    </div>
  );
}
