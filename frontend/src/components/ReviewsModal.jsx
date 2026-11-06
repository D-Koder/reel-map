import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Flag, Pencil, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';
import useSheetDrag from '../lib/useSheetDrag';

const BUCKET = 'visit-photos';
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_BYTES = 10 * 1024 * 1024;

const MAX_PHOTOS = 5;

// The photos a review lists (storage paths), shown as a grid. With onRemove each has a remove button.
function PhotoGrid({ paths, onOpen, onRemove }) {
  const [urls, setUrls] = useState({});
  const key = paths.join('|');
  useEffect(() => {
    let live = true;
    if (!paths.length) { setUrls({}); return undefined; }
    supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60).then(({ data }) => {
      if (!live) return;
      setUrls(Object.fromEntries((data ?? []).filter((f) => f.signedUrl).map((f) => [f.path, f.signedUrl])));
    });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = paths.filter((path) => urls[path]);
  if (!shown.length) return null;
  return (
    <ul className="visit-photos">
      {shown.map((path) => (
        <li key={path}>
          <button type="button" className="visit-photo-btn" onClick={() => onOpen({ path, url: urls[path] })} aria-label="Open photo">
            <img src={urls[path]} alt="Review photo" />
          </button>
          {onRemove && (
            <button type="button" className="visit-photo-remove" onClick={() => onRemove(path)} aria-label="Remove photo">
              <Trash2 className="ico" aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

// Every review of this location, whichever collection or visit it was written in.
// Yours comes first, with an edit icon. canWrite: you can add a review (you've been, or it's planned for today).
export default function ReviewsModal({ place, userId, canWrite, onSave, onDelete, onReport, onClose, showToast }) {
  const locationId = place.location_id;
  const reviews = place.reviews ?? [];
  const mine = reviews.find((r) => r.user_id === userId);
  const others = reviews.filter((r) => r.user_id !== userId);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(mine?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState(null);
  // Photos while editing: the review's list, what was uploaded this time (dropped again on Cancel),
  // and what was taken off (only removed from storage once Save goes through).
  const [paths, setPaths] = useState(mine?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  // Whose review is being reported: asked once before it's sent.
  const [reporting, setReporting] = useState(null);
  const [reported, setReported] = useState([]);
  const addedRef = useRef([]);
  const removedRef = useRef([]);
  const viewingRef = useRef(null);
  viewingRef.current = viewing;
  const closeRef = useRef(null);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      if (viewingRef.current) setViewing(null);
      else closeRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const dropFiles = (list) => (list.length ? supabase.storage.from(BUCKET).remove(list) : null);

  const startEdit = () => {
    setText(mine?.body ?? '');
    setPaths(mine?.photos ?? []);
    addedRef.current = [];
    removedRef.current = [];
    setEditing(true);
  };

  const stopEdit = () => {
    dropFiles(addedRef.current);
    addedRef.current = [];
    removedRef.current = [];
    setEditing(false);
  };

  const close = () => {
    if (editing) stopEdit();
    onClose();
  };

  closeRef.current = close;
  const sheetRef = useRef(null);
  const sheetDrag = useSheetDrag(sheetRef, close);

  const addPhotos = async (event) => {
    const chosen = [...(event.target.files || [])];
    event.target.value = '';
    const ok = chosen.filter((file) => TYPES.includes(file.type) && file.size <= MAX_BYTES);
    if (ok.length < chosen.length) showToast('Only photos under 10 MB can be added.');
    const room = MAX_PHOTOS - paths.length;
    if (ok.length > room) showToast(`A review can have up to ${MAX_PHOTOS} photos.`);
    const take = ok.slice(0, Math.max(0, room));
    if (!take.length) return;
    setUploading(true);
    const done = [];
    let failed = 0;
    for (const file of take) {
      const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'photo';
      const path = `${locationId}/${userId}/${Date.now()}-${done.length}-${safeName}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (error) failed += 1; else done.push(path);
    }
    setUploading(false);
    if (failed) showToast(`${failed} photo${failed === 1 ? '' : 's'} couldn't be uploaded.`);
    addedRef.current = [...addedRef.current, ...done];
    setPaths((list) => [...list, ...done].slice(0, MAX_PHOTOS));
  };

  const removePhoto = (path) => {
    setPaths((list) => list.filter((p) => p !== path));
    if (addedRef.current.includes(path)) {
      addedRef.current = addedRef.current.filter((p) => p !== path);
      dropFiles([path]);
    } else {
      removedRef.current = [...removedRef.current, path];
    }
  };

  const save = async () => {
    setSaving(true);
    const ok = await onSave(text.trim(), paths);
    setSaving(false);
    if (ok) {
      dropFiles(removedRef.current);
      addedRef.current = [];
      removedRef.current = [];
      setEditing(false);
    } else showToast("Couldn't save the review.");
  };

  const remove = async () => {
    if (await onDelete()) { addedRef.current = []; removedRef.current = []; setEditing(false); }
  };

  const report = async (review) => {
    const ok = await onReport?.(review);
    setReporting(null);
    if (ok) { setReported((list) => [...list, review.user_id]); showToast('Thanks, we will take a look.'); }
    else showToast("Couldn't send the report.");
  };

  const when = (value) => new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  const card = (review, isMine) => (
    <li key={review.user_id} className="review-card">
      <div className="review-head">
        <Avatar person={review.author} className="review-avatar" />
        <div className="review-who">
          <strong>{isMine ? 'You' : review.author?.display_name ?? 'Someone'}</strong>
          <span>{when(review.created_at ?? review.updated_at)}</span>
        </div>
        {isMine && !editing && (
          <button type="button" className="review-edit" onClick={startEdit} aria-label="Edit your review" title="Edit">
            <Pencil className="ico" aria-hidden="true" />
          </button>
        )}
        {!isMine && onReport && !reported.includes(review.user_id) && reporting !== review.user_id && (
          <button type="button" className="review-edit" onClick={() => setReporting(review.user_id)} aria-label="Report this review" title="Report">
            <Flag className="ico" aria-hidden="true" />
          </button>
        )}
      </div>
      {isMine && editing ? (
        <>
          <textarea className="step-input note-input" rows={4} maxLength={500} autoFocus placeholder="How was it?" value={text} onChange={(e) => setText(e.target.value)} disabled={saving} />
          <PhotoGrid paths={paths} onOpen={setViewing} onRemove={removePhoto} />
          {paths.length < MAX_PHOTOS && (
            <label className={`step-btn secondary full-width booking-files-upload${uploading ? ' disabled' : ''}`}>
              <input type="file" accept="image/*" multiple hidden disabled={uploading} onChange={addPhotos} />
              {uploading ? <><span className="spinner" aria-hidden="true" />Uploading…</> : <><Camera className="ico" aria-hidden="true" /> Add photos ({paths.length}/{MAX_PHOTOS})</>}
            </label>
          )}
          <div className="step-buttons">
            <button type="button" className="step-btn primary" disabled={saving || uploading} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="step-btn secondary" disabled={saving} onClick={stopEdit}>Cancel</button>
          </div>
          {Boolean(mine) && (
            <button type="button" className="step-btn secondary full-width" disabled={saving} onClick={remove}>
              <Trash2 className="ico" aria-hidden="true" /> Delete my review
            </button>
          )}
        </>
      ) : (
        <>
          {review.body && <p className="review-body">{review.body}</p>}
          <PhotoGrid paths={review.photos ?? []} onOpen={setViewing} />
          {!isMine && reporting === review.user_id && (
            <div className="review-report">
              <span>Report this review?</span>
              <button type="button" className="step-btn danger" onClick={() => report(review)}>Report</button>
              <button type="button" className="step-btn secondary" onClick={() => setReporting(null)}>Cancel</button>
            </div>
          )}
        </>
      )}
    </li>
  );

  return createPortal(
    <div className="modal-overlay reviews-overlay" onClick={close}>
      <div ref={sheetRef} className="modal reviews-modal" role="dialog" aria-modal="true" aria-label={`Reviews of ${place.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" {...sheetDrag} />
        <div className="modal-header">
          <div className="modal-title">Reviews · {place.name}</div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close"><X aria-hidden="true" /></button>
        </div>
        <ul className="review-list">
          {mine && card(mine, true)}
          {!mine && canWrite && !editing && (
            <li>
              <button type="button" className="step-btn primary full-width" onClick={startEdit}>
                <Pencil className="ico" aria-hidden="true" /> Write a review
              </button>
            </li>
          )}
          {!mine && editing && card({ user_id: userId, body: '', updated_at: new Date().toISOString(), author: null }, true)}
          {others.map((review) => card(review, false))}
        </ul>
        {!reviews.length && !editing && !canWrite && (
          <p className="place-collection-note">No reviews yet. Once you've been, you can add one.</p>
        )}
        {place.location_id === place.id && (
          <p className="place-collection-note">This place has no map pin yet, so only you can see its reviews. Verify its location to share them.</p>
        )}
        <p className="place-collection-note">Reviews are public: anyone using the app can see them for this venue, with the reviewer's name.</p>
      </div>
      {viewing && (
        <div className="booking-lightbox" role="dialog" aria-modal="true" aria-label="Photo" onClick={(e) => { e.stopPropagation(); setViewing(null); }}>
          <button type="button" className="booking-lightbox-close" onClick={() => setViewing(null)} aria-label="Close"><X aria-hidden="true" /></button>
          <img src={viewing.url} alt="Review photo" className="booking-lightbox-img" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>,
    document.body,
  );
}
