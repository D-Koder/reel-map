import { useEffect, useRef, useState } from 'react';

// A number that rolls up to its target (ease-out) instead of jumping. Starts from `from`, or from where it last was.
export default function useCountUp(target, { from = null, delay = 0, duration = 700 } = {}) {
  const [value, setValue] = useState(from ?? target);
  const shown = useRef(from ?? target);
  useEffect(() => {
    const start = shown.current;
    if (start === target) return undefined;
    let frame;
    let t0 = null;
    const step = (now) => {
      if (t0 === null) t0 = now + delay;
      if (now < t0) { frame = requestAnimationFrame(step); return; }
      const k = Math.min(1, (now - t0) / duration);
      const next = Math.round(start + (target - start) * (1 - (1 - k) ** 3));
      shown.current = next;
      setValue(next);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, delay, duration]);
  return value;
}
