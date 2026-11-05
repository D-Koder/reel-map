import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Pencil, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';

const BUCKET = 'visit-photos';
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_BYTES = 10 * 1024 * 1024;

// One person's photos for a location: "<location>/<person>/<file>".
function ReviewPhotos({ locationId, personId, editable, showToast, onOpen, refreshKey }) {
  const folder = `${locationId}/${personId}`;
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, { sortBy: { column: 'created_at', order: 'asc' } });
    if (error || !data?.length) { setPhotos([]); return; }
    const paths = data.map((file) => `${folder}/${file.name}`);
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
    setPhotos(data.map((file, i) => ({ path: paths[i], url: signed?.[i]?.signedUrl || null })).filter((p) => p.url));
  };
  useEffect(() => { load(); }, [folder, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (event) => {
    const chosen = [...(event.target.files || [])];
    event.target.value = '';
    const ok = chosen.filter((file) => TYPES.includes(file.type) && file.size <= MAX_BYTES);
    if (ok.length < chosen.length) showToast('Only photos under 10 MB can be added.');
    if (!ok.length) return;
    setUploading(true);
    let failed = 0;
    for (const file of ok) {
      const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'photo';
      const { error } = await supabase.storage.from(BUCKET).upload(`${folder}/${Date.now()}-${safeName}`, file, { contentType: file.type });
      if (error) failed += 1;
    }
    setUploading(false);
    if (failed) showToast(`${failed} photo${failed === 1 ? '' : 's'} couldn't be uploaded.`);
    load();
  };

  const remove = async (photo) => {
    const { data, error } = await supabase.storage.from(BUCKET).remove([photo.path]);
    if (error || !data?.length) { showToast("Couldn't remove that photo."); return; }
    load();
  };

  if (!editable && !photos.length) return null;
  return (
    <>
      {photos.length > 0 && (
        <ul className="visit-photos">
          {photos.map((photo) => (
            <li key={photo.path}>
              <button type="button" className="visit-photo-btn" onClick={() => onOpen(photo)} aria-label="Open photo">
                <img src={photo.url} alt="Review photo" />
              </button>
              {editable && (
                <button type="button" className="visit-photo-remove" onClick={() => remove(photo)} aria-label="Remove photo">
                  <Trash2 className="ico" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <label className={`step-btn secondary full-width booking-files-upload${uploading ? ' disabled' : ''}`}>
          <input type="file" accept="image/*" multiple hidden disabled={uploading} onChange={upload} />
          {uploading ? <><span className="spinner" aria-hidden="true" />Uploading…</> : <><Camera className="ico" aria-hidden="true" /> Add photos</>}
        </label>
      )}
    </>
  );
}

// Every review of this location, whichever collection or visit it was written in.
// Yours comes first, with an edit icon. canWrite: you can add a review (you've been, or it's planned for today).
export default function ReviewsModal({ place, userId, canWrite, onSave, onDelete, onClose, showToast }) {
  const locationId = place.location_id;
  const reviews = place.reviews ?? [];
  const mine = reviews.find((r) => r.user_id === userId);
  const others = reviews.filter((r) => r.user_id !== userId);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(mine?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState(null);
  const viewingRef = useRef(null);
  viewingRef.current = viewing;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      if (viewingRef.current) setViewing(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const startEdit = () => { setText(mine?.body ?? ''); setEditing(true); };

  const save = async () => {
    setSaving(true);
    const ok = await onSave(text.trim());
    setSaving(false);
    if (ok) setEditing(false);
    else showToast("Couldn't save the review.");
  };

  const remove = async () => {
    if (await onDelete()) setEditing(false);
  };

  const when = (value) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  const card = (review, isMine) => (
    <li key={review.user_id} className="review-card">
      <div className="review-head">
        <Avatar person={review.author} className="face-avatar" />
        <div className="review-who">
          <strong>{isMine ? 'You' : review.author?.display_name ?? 'Someone'}</strong>
          <span>{when(review.updated_at)}</span>
        </div>
        {isMine && !editing && (
          <button type="button" className="review-edit" onClick={startEdit} aria-label="Edit your review" title="Edit">
            <Pencil className="ico" aria-hidden="true" />
          </button>
        )}
      </div>
      {isMine && editing ? (
        <>
          <textarea className="step-input note-input" rows={4} maxLength={500} autoFocus placeholder="How was it?" value={text} onChange={(e) => setText(e.target.value)} disabled={saving} />
          <div className="step-buttons">
            <button type="button" className="step-btn primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" className="step-btn secondary" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
          </div>
          <button type="button" className="step-btn secondary full-width" disabled={saving} onClick={remove}>
            <Trash2 className="ico" aria-hidden="true" /> Delete my review
          </button>
        </>
      ) : (
        review.body && <p className="review-body">{review.body}</p>
      )}
      <ReviewPhotos locationId={locationId} personId={review.user_id} editable={isMine && editing} showToast={showToast} onOpen={setViewing} />
    </li>
  );

  return createPortal(
    <div className="modal-overlay reviews-overlay" onClick={onClose}>
      <div className="modal reviews-modal" role="dialog" aria-modal="true" aria-label={`Reviews of ${place.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Reviews · {place.name}</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button>
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
        <p className="place-collection-note">Reviews are for the location, so they show wherever it's saved. People you share a collection with can see them.</p>
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
