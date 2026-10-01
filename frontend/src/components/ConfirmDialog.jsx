import React, { useEffect, useRef } from 'react';

export default function ConfirmDialog({ title, message, warning, confirmLabel, onConfirm, onCancel }) {
  const cancelRef = useRef(null);

  // Start on Cancel so a stray Enter/tap doesn't delete anything.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    // stopPropagation: this sits inside the place sheet's backdrop, which would otherwise close too.
    <div
      className="confirm-overlay"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-title" id="confirm-title">
          {title}
        </div>
        <div className="confirm-message" id="confirm-message">
          {message}
        </div>
        {warning && <div className="confirm-warning">{warning}</div>}
        <div className="confirm-actions">
          <button className="step-btn danger-solid" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button ref={cancelRef} className="step-btn secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
