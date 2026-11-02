import React, { useEffect, useState } from 'react';
import BookingFiles from './BookingFiles';
import { toLocalInputValue } from '../lib/constants';

// Edit a planned booking: when it's on, and its booking confirmations (screenshots or PDFs).
// The time saves the same way planning it does (onSave resolves true when it's saved).
export default function EditBookingDialog({ place, canUpload, onSave, onClose, showToast }) {
  const original = toLocalInputValue(place.booking.planned_at);
  const [when, setWhen] = useState(original);
  const [saving, setSaving] = useState(false);
  const changed = Boolean(when) && when !== original;

  // Escape closes this only, not the place sheet underneath (it listens on window too).
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    const ok = await onSave(when);
    setSaving(false);
    if (ok) {
      showToast('Booking updated');
      onClose();
    }
  };

  return (
    // stopPropagation: this sits inside the place sheet, which would otherwise close too.
    <div
      className="confirm-overlay"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="confirm-dialog edit-booking"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-booking-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-title" id="edit-booking-title">Edit booking</div>

        <div className="modal-label" id="edit-booking-when-label">Planned for</div>
        <input
          type="datetime-local"
          className="step-input"
          aria-labelledby="edit-booking-when-label"
          value={when}
          disabled={!canUpload}
          onChange={(e) => setWhen(e.target.value)}
        />
        {canUpload && (
          <div className="confirm-actions">
            <button type="button" className="step-btn primary" onClick={save} disabled={saving || !changed}>
              {saving ? 'Saving…' : 'Save date'}
            </button>
            <button type="button" className="step-btn secondary" onClick={onClose}>Close</button>
          </div>
        )}

        <div className="edit-booking-files">
          <div className="modal-label">Booking confirmation</div>
          <BookingFiles place={place} canUpload={canUpload} showToast={showToast} />
        </div>
        {!canUpload && (
          <div className="confirm-actions">
            <button type="button" className="step-btn secondary" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
