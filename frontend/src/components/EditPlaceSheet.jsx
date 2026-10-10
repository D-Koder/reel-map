import React, { useEffect, useState } from 'react';
import useSheetDrag from '../lib/useSheetDrag';
import { categories } from '../lib/constants';

// Only whoever added the place can open this; vibes are set in the place sheet.
export default function EditPlaceSheet({ place, collections = [], userId, onSave, onCopy, onMove, onClose }) {
  const sheetRef = React.useRef(null);
  const sheetDrag = useSheetDrag(sheetRef, onClose);
  const [name, setName] = useState(place.name);
  const [category, setCategory] = useState(place.category);
  const [saving, setSaving] = useState(false);
  const [copyTarget, setCopyTarget] = useState('');
  const [moveTarget, setMoveTarget] = useState('');
  const [busyAction, setBusyAction] = useState(null); // 'copy' | 'move' | null

  const placeIn = place.collectionIds ?? [];
  const copyOptions = collections.filter((c) => !placeIn.includes(c.id));
  const moveOptions = collections.filter((c) => c.id !== place.collection_id);
  const canMove = place.added_by === userId;

  const runCopy = async () => {
    setBusyAction('copy');
    const ok = await onCopy(copyTarget);
    setBusyAction(null);
    if (ok) setCopyTarget('');
  };

  const runMove = async () => {
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
            ✕
          </button>
        </div>

        <label className="field">
          <span className="modal-label">Name</span>
          <input
            className="step-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Place name"
            maxLength={80}
            required
          />
        </label>

        <label className="field">
          <span className="modal-label">Category</span>
          <select className="step-input" value={category} onChange={(e) => setCategory(e.target.value)}>
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
              <button type="button" className="step-btn secondary" disabled={!moveTarget || !!busyAction} onClick={runMove}>
                {busyAction === 'move' ? <><span className="spinner" aria-hidden="true" />Moving…</> : 'Move'}
              </button>
            </div>
          </div>
        )}

        <button type="submit" className="step-btn primary full-width" disabled={saving}>
          {saving ? <><span className="spinner" aria-hidden="true" />Saving…</> : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
