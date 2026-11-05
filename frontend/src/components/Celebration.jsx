import React, { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';

const CONFETTI = ['🎉', '✨', '🧡', '🥂', '⭐', '🎊'];
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_BYTES = 10 * 1024 * 1024;

// Shown after a place is marked as done. The review and photo are optional and quick:
// "Save" sends them, "Skip" just closes.
export default function Celebration({ placeName, streak, onClose, onSave }) {
  const buttonRef = useRef(null);
  const [review, setReview] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    navigator.vibrate?.([30, 60, 30]);
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!photo) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const pick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!TYPES.includes(file.type) || file.size > MAX_BYTES) {
      setError('Pick a photo under 10 MB.');
      return;
    }
    setError('');
    setPhoto(file);
  };

  const hasMemory = Boolean(photo || review.trim());

  const save = async () => {
    setSaving(true);
    setError('');
    const ok = await onSave?.({ review: review.trim(), photo });
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
            <label className={`step-btn secondary full-width celebrate-photo${saving ? ' disabled' : ''}`}>
              <input type="file" accept="image/*" hidden disabled={saving} onChange={pick} />
              {preview
                ? <img src={preview} alt="Your photo" className="celebrate-photo-thumb" />
                : <Camera className="ico" aria-hidden="true" />}
              {preview ? 'Change photo' : 'Add a photo'}
            </label>
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
