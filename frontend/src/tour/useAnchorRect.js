import { useEffect, useState } from 'react';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Follows an element on screen (it can move: sheets slide in, the page scrolls) and scrolls it into view once.
export default function useAnchorRect(selector) {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    if (!selector) { setRect(null); return undefined; }
    let frame = 0;
    let last = '';
    let scrolledTo = '';
    const tick = () => {
      const el = document.querySelector(selector);
      const r = el?.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) {
        if (scrolledTo !== selector) {
          scrolledTo = selector;
          el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
        }
        const key = `${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}|${Math.round(r.height)}`;
        if (key !== last) { last = key; setRect({ left: r.left, top: r.top, width: r.width, height: r.height }); }
      } else if (last) { last = ''; setRect(null); }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [selector]);
  return rect;
}
