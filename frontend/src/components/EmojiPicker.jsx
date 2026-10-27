import React, { useEffect, useId, useRef, useState } from 'react';
import { EMOJI_GROUPS } from '../lib/emojiChoices';

// An emoji chosen with one tap from a small popover under the button, not typed with the phone's emoji keyboard.
// The button shows the choice (or the dimmed placeholder when there is none); noneLabel adds a button to clear it.
export default function EmojiPicker({ value, onChange, placeholder, label, noneLabel = '', describedBy, disabled = false }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef(null);
  const choose = (emoji) => {
    onChange(emoji);
    setOpen(false);
  };

  // A tap outside the popover closes it.
  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="emoji-picker"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.stopPropagation();
        setOpen(false);
      }}
    >
      <button
        type="button"
        className={`emoji-trigger ${value ? '' : 'is-placeholder'}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${label}: ${value || 'none'}`}
        aria-describedby={describedBy}
      >
        {value || placeholder}
      </button>
      {open && (
        <div id={panelId} className="emoji-panel" role="group" aria-label={label}>
          <div className="emoji-grid">
            {EMOJI_GROUPS.flatMap((group) => group.emoji).map((emoji) => (
              <button key={emoji} type="button" className="emoji-cell" aria-pressed={value === emoji} onClick={() => choose(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
          {noneLabel && (
            <button type="button" className="emoji-none" onClick={() => choose('')}>{noneLabel}</button>
          )}
        </div>
      )}
    </div>
  );
}
