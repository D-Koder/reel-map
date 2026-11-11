import React, { useEffect, useId, useRef, useState } from 'react';

// A small "i" button that opens a short note under it. Tapping anywhere else, or pressing Escape, closes it.
// Put it inside a `.label-row` so the note can use the row's full width.
export default function InfoHint({ label = 'More info', children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const closeOnEscape = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <span className="info-hint" ref={ref}>
      <button type="button" className="info-hint-btn" aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((value) => !value)}>
        i
      </button>
      {open && <span className="info-hint-bubble" role="tooltip" id={id}>{children}</span>}
    </span>
  );
}
