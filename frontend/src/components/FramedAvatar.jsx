import React from 'react';
import { frameById } from '../lib/achievements';

// Puts a profile frame around whatever picture it wraps. With no frame it renders the picture unchanged.
// `small` is for the little faces beside votes and reviews: a thinner ring that does not push the layout around.
export default function FramedAvatar({ frame, small = false, children }) {
  const def = frame ? frameById(frame) : null;
  if (!def) return children;
  return (
    <span className={`framed frame-${def.id}${small ? ' framed-sm' : ''}`}>
      {children}
      {!small && def.glyph?.[1].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <span key={deg} className="frame-glyph" aria-hidden="true" style={{ left: `${50 + 47 * Math.sin(rad)}%`, top: `${50 - 47 * Math.cos(rad)}%` }}>
            {def.glyph[0]}
          </span>
        );
      })}
    </span>
  );
}
