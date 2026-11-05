import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Trash2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

const BUCKET = 'visit-photos';
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_BYTES = 10 * 1024 * 1024;

// The review and photos for a visit. Everyone in the collection can see them.
// `editable` (the plan is today, and you can edit) lets you change the review and add or remove photos.
export default function VisitMemory({ place, editable, onSaveReview, showToast }) {
  const folder = `${place.collection_id}/${place.id}`;
  const saved = place.booking?.review ?? '';
  const [text, setText] = useState(saved);
  const [savingText, setSavingText] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(null);

  // Follows the saved review, e.g. after it's changed from the pop-up or another phone.
  useEffect(() => { setText(saved); }, [saved]);

  const load = async () => {
    if (!place.collection_id) return;
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, { sortBy: { column: 'created_at', order: 'asc' } });
    if (error || !data?.length) { setPhotos([]); return; }
    const paths = data.map((file) => `${folder}/${file.name}`);
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
    setPhotos(data.map((file, i) => ({ path: paths[i], name: file.name, url: signed?.[i]?.signedUrl || null })).filter((p) => p.url));
  };

  useEffect(() => { load(); }, [folder]); // eslint-disable-line react-hooks/exhaustive-deps

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
    showToast(failed ? `${failed} photo${failed === 1 ? '' : 's'} couldn't be uploaded.` : 'Photo added');
    load();
  };

  const remove = async (photo) => {
    const { data, error } = await supabase.storage.from(BUCKET).remove([photo.path]);
    if (error || !data?.length) { showToast('Only the person who added it can remove it.'); return; }
    load();
  };

  const saveText = async () => {
    setSavingText(true);
    const ok = await onSaveReview(text.trim());
    setSavingText(false);
    showToast(ok ? 'Review saved' : "Couldn't save the review.");
  };

  if (!editable && !saved && !photos.length) return null;

  return (
    <div className="visit-memory">
      {photos.length > 0 && (
        <ul className="visit-photos">
          {photos.map((photo) => (
            <li key={photo.path}>
              <button type="button" className="visit-photo-btn" onClick={() => setViewing(photo)} aria-label="Open photo">
                <img src={photo.url} alt="Photo from the visit" />
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
      {editable ? (
        <>
          <textarea
            className="step-input note-input"
            rows={3}
            maxLength={500}
            placeholder="How was it? (optional)"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={savingText}
          />
          {text.trim() !== saved && (
            <button type="button" className="step-btn primary full-width" disabled={savingText} onClick={saveText}>
              {savingText ? 'Saving…' : 'Save review'}
            </button>
          )}
          <label className={`step-btn secondary full-width booking-files-upload${uploading ? ' disabled' : ''}`}>
            <input type="file" accept="image/*" multiple hidden disabled={uploading} onChange={upload} />
            {uploading ? <><span className="spinner" aria-hidden="true" />Uploading…</> : <><Camera className="ico" aria-hidden="true" /> Add photos</>}
          </label>
        </>
      ) : saved && <p className="visit-memory-review">{saved}</p>}
      {viewing && createPortal(
        <div className="booking-lightbox" role="dialog" aria-modal="true" aria-label="Photo" onClick={(event) => { event.stopPropagation(); setViewing(null); }}>
          <button type="button" className="booking-lightbox-close" onClick={() => setViewing(null)} aria-label="Close"><X aria-hidden="true" /></button>
          <img src={viewing.url} alt="Photo from the visit" className="booking-lightbox-img" onClick={(event) => event.stopPropagation()} />
        </div>,
        document.body,
      )}
    </div>
  );
}
