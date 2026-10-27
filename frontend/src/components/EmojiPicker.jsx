import React, { useId, useState } from 'react';
import { EMOJI_GROUPS } from '../lib/emojiChoices';

// An emoji chosen with one tap from a short list, not typed with the phone's emoji keyboard.
// The button shows the choice (or the dimmed placeholder when there is none); noneLabel adds a button to clear it.
export default function EmojiPicker({ value, onChange, placeholder, label, noneLabel = '', describedBy, disabled = false }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const choose = (emoji) => {
    onChange(emoji);
    setOpen(false);
  };

  return (
    <div
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
          {EMOJI_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="emoji-group-title">{group.title}</div>
              <div className="emoji-grid">
                {group.emoji.map((emoji) => (
                  <button key={emoji} type="button" className="emoji-cell" aria-pressed={value === emoji} onClick={() => choose(emoji)}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {noneLabel && (
            <button type="button" className="emoji-none" onClick={() => choose('')}>{noneLabel}</button>
          )}
        </div>
      )}
    </div>
  );
}
