import React from 'react';
import { frameArt, frameById } from '../lib/achievements';

// Puts a profile frame (a picture, or the CSS ring for the rainbow) around whatever picture it wraps. With no frame it gets a light grey ring.
// `small` is for the little faces beside votes and reviews: a thinner ring that does not push the layout around.
export default function FramedAvatar({ frame, small = false, children }) {
  const def = frame ? frameById(frame) : null;
  // No frame is a plain, thick light grey ring (drawn outside the picture, so nothing moves).
  if (!def) return <span className={`framed-none${small ? ' framed-none-sm' : ''}`}>{children}</span>;
  const art = frameArt(def.id);
  // A picture frame: the avatar keeps its own size and the picture is drawn around it, reaching past the edge.
  if (art) {
    return (
      <span className={`framed framed-art frame-${def.id}${small ? ' framed-sm' : ''}`} style={{ '--art': `url(${art})` }}>
        {children}
        <img className="frame-art-img" src={art} alt="" aria-hidden="true" draggable="false" />
      </span>
    );
  }
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
