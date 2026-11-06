import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

const CONFETTI = ['🎉', '✨', '🧡', '🥂', '⭐', '🎊'];
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_BYTES = 10 * 1024 * 1024;

// Shown after a place is marked as done. The review and photos (up to maxPhotos, 5 at most) are optional and quick:
// "Save" sends them, "Nice!" just closes.
export default function Celebration({ placeName, streak, onClose, onSave, maxPhotos = 5 }) {
  const buttonRef = useRef(null);
  const [review, setReview] = useState('');
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    navigator.vibrate?.([30, 60, 30]);
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Each photo with a preview address, made once when it's added and released when it's taken off.
  const previews = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const pick = (event) => {
    const chosen = [...(event.target.files || [])];
    event.target.value = '';
    if (!chosen.length) return;
    const ok = chosen.filter((file) => TYPES.includes(file.type) && file.size <= MAX_BYTES);
    const room = maxPhotos - photos.length;
    if (ok.length < chosen.length) setError('Only photos under 10 MB can be added.');
    else if (ok.length > room) setError(`Up to ${maxPhotos} photos.`);
    else setError('');
    if (ok.length) setPhotos((list) => [...list, ...ok.slice(0, Math.max(0, room))]);
  };

  const hasMemory = Boolean(photos.length || review.trim());

  const save = async () => {
    setSaving(true);
    setError('');
    const ok = await onSave?.({ review: review.trim(), photos });
    setSaving(false);
    if (ok === false) setError("Couldn't save that. Try again, or skip.");
    else onClose();
  };

  return (
    <div className="celebrate-overlay" onClick={onClose}>
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} style={{ '--i': i, left: `${(i * 37) % 100}%` }}>
            {CONFETTI[i % CONFETTI.length]}
          </span>
        ))}
      </div>
      <div
        className="celebrate-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebrate-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="celebrate-emoji" aria-hidden="true">🎉</div>
        <div className="celebrate-title" id="celebrate-title">You went to {placeName}!</div>
        <p className="celebrate-text">
          {streak > 0
            ? `That's ${streak} ${streak === 1 ? 'adventure' : 'adventures'} this month 🔥`
            : 'Another memory made together.'}
        </p>

        {onSave && (
          <div className="celebrate-memory">
            <textarea
              className="celebrate-review"
              rows={2}
              maxLength={500}
              placeholder="How was it? (optional)"
              value={review}
              onChange={(event) => setReview(event.target.value)}
              disabled={saving}
            />
            {photos.length > 0 && (
              <ul className="celebrate-thumbs">
                {photos.map((file, i) => (
                  <li key={`${file.name}-${i}`}>
                    <img src={previews[i]} alt={`Photo ${i + 1}`} />
                    <button type="button" aria-label={`Remove photo ${i + 1}`} disabled={saving} onClick={() => setPhotos((list) => list.filter((_, j) => j !== i))}>
                      <X aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {photos.length < maxPhotos ? (
              <label className={`step-btn secondary full-width celebrate-photo${saving ? ' disabled' : ''}`}>
                <input type="file" accept="image/*" multiple hidden disabled={saving} onChange={pick} />
                <Camera className="ico" aria-hidden="true" />
                {photos.length ? `Add more (${photos.length}/${maxPhotos})` : 'Add photos'}
              </label>
            ) : null}
            {error && <p className="celebrate-error" role="alert">{error}</p>}
          </div>
        )}

        {onSave && hasMemory ? (
          <button type="button" className="step-btn primary full-width" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save 🙌'}
          </button>
        ) : (
          <button ref={buttonRef} type="button" className="step-btn primary full-width" onClick={onClose}>
            Nice! 🙌
          </button>
        )}
      </div>
    </div>
  );
}
