import React, { useEffect, useRef } from 'react';

const CONFETTI = ['🎉', '✨', '🧡', '🥂', '⭐', '🎊'];

// Shown after a place is marked as done.
export default function Celebration({ placeName, streak, onClose }) {
  const buttonRef = useRef(null);

  useEffect(() => {
    buttonRef.current?.focus();
    navigator.vibrate?.([30, 60, 30]);
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        <button ref={buttonRef} type="button" className="step-btn primary full-width" onClick={onClose}>
          Nice! 🙌
        </button>
      </div>
    </div>
  );
}
