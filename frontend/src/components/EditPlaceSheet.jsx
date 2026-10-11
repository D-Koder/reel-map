import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import useSheetDrag from '../lib/useSheetDrag';
import { categories } from '../lib/constants';
import { entriesAtSpot } from '../lib/places';
import DuplicateWarning from './DuplicateWarning';

// Any member can open this to copy the place. Only whoever added it can change its name, category or collection.
export default function EditPlaceSheet({ place, collections = [], places = [], userId, onSave, onCopy, onMove, onClose }) {
  const sheetRef = React.useRef(null);
  const sheetDrag = useSheetDrag(sheetRef, onClose);
  const [name, setName] = useState(place.name);
  const [category, setCategory] = useState(place.category);
  const [saving, setSaving] = useState(false);
  const [copyTarget, setCopyTarget] = useState('');
  const [moveTarget, setMoveTarget] = useState('');
  const [busyAction, setBusyAction] = useState(null); // 'copy' | 'move' | null
  // Places already in the chosen collection that this one would duplicate.
  const [moveDuplicates, setMoveDuplicates] = useState([]);

  const placeIn = place.collectionIds ?? [];
  const copyOptions = collections.filter((c) => !placeIn.includes(c.id));
  const moveOptions = collections.filter((c) => c.id !== place.collection_id);
  const isAdder = place.added_by === userId;
  const canMove = isAdder;

  const runCopy = async () => {
    setBusyAction('copy');
    const ok = await onCopy(copyTarget);
    setBusyAction(null);
    if (ok) setCopyTarget('');
  };

  // Same check as adding a place: the same place, or the same spot, already in that collection.
  const findMoveDuplicates = () => {
    const inTarget = places.filter((p) => p.collection_id === moveTarget);
    const sameSpot = Number.isFinite(place.lat) && Number.isFinite(place.lng)
      ? entriesAtSpot(inTarget, place.lat, place.lng)
      : [];
    const samePlace = inTarget.filter((p) => p.id === place.id);
    return [...new Map([...samePlace, ...sameSpot].map((p) => [p.id, p])).values()];
  };

  const runMove = async (confirmed = false) => {
    if (!confirmed) {
      const matches = findMoveDuplicates();
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
    await onSave({ name: name.trim(), category });
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

        {!isAdder && (
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
          <span className="modal-label">Category</span>
          <select className="step-input" value={category} onChange={(e) => setCategory(e.target.value)} disabled={!isAdder}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

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
            <div className="place-collection-note">It's already in all your collections.</div>
          ) : (
            <div className="field-row">
              <select className="step-input" value={copyTarget} onChange={(e) => setCopyTarget(e.target.value)} disabled={!!busyAction}>
                <option value="">Choose a collection…</option>
                {copyOptions.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
              <button type="button" className="step-btn secondary" disabled={!copyTarget || !!busyAction} onClick={runCopy}>
                {busyAction === 'copy' ? <><span className="spinner" aria-hidden="true" />Copying…</> : 'Copy'}
              </button>
            </div>
          )}
        </div>

        {canMove && (
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
