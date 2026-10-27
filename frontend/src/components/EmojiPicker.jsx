import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { EMOJI_GROUPS } from '../lib/emojiChoices';

// An emoji chosen with one tap from a small popover under the button, not typed with the phone's emoji keyboard.
// The button shows the choice (or the dimmed placeholder when there is none); noneLabel adds a button to clear it.
export default function EmojiPicker({ value, onChange, placeholder, label, noneLabel = '', describedBy, disabled = false }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  // Where the popover sits so it stays on screen: shifted sideways by dx, or above the button when there is no room below.
  const [place, setPlace] = useState({ dx: 0, above: false });
  const choose = (emoji) => {
    onChange(emoji);
    setOpen(false);
  };

  // Measured as it opens (and when the screen changes size): slide it back from a screen edge, and flip it above
  // the button when it would run off the bottom.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const MARGIN = 8;
    const GAP = 10;
    const measure = () => {
      const panel = panelRef.current;
      const root = rootRef.current;
      if (!panel || !root) return;
      const box = root.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const screenWidth = document.documentElement.clientWidth;
      const screenHeight = window.visualViewport?.height ?? window.innerHeight;
      let dx = 0;
      if (box.left + width > screenWidth - MARGIN) dx = screenWidth - MARGIN - width - box.left;
      if (box.left + dx < MARGIN) dx = MARGIN - box.left;
      const below = screenHeight - box.bottom - GAP - MARGIN;
      const above = box.top - GAP - MARGIN;
      setPlace({ dx: Math.round(dx), above: height > below && above > below });
    };
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [open]);

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
        <div
          id={panelId}
          ref={panelRef}
          className={`emoji-panel ${place.above ? 'is-above' : ''}`}
          role="group"
          aria-label={label}
          style={{ left: place.dx, '--arrow-left': `${Math.max(12, 20 - place.dx)}px` }}
        >
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
