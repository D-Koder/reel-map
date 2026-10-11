import React from 'react';

// Shown before a place is added or moved into a collection that already has it.
export default function DuplicateWarning({ matches, title, question, confirmLabel, onCancel, onConfirm }) {
  return (
    // Stops the click reaching the sheet underneath, which would close it too.
    <div className="modal-overlay location-verify-overlay" onClick={(e) => { e.stopPropagation(); onCancel(); }}>
      <div
        className="modal location-verify-modal"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">{title}</div>
        </div>
        <p className="modal-label">Saved here already:</p>
        <div className="location-verify-results">
          {matches.map((place) => (
            <div key={place.id} className="location-verify-result">
              <strong>{place.name}</strong>
              <span>{place.custom_info || 'No custom info'}</span>
            </div>
          ))}
        </div>
        <p className="modal-label">{question}</p>
        <div className="field-row">
          <button type="button" className="step-btn secondary full-width" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="step-btn primary full-width" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
