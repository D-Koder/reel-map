import React, { useEffect, useRef, useState } from 'react';

// The steps a lookup goes through, with how much of its time each one takes (the weights are relative).
const STAGES = [
  { label: 'Opening the reel…', weight: 1 },
  { label: 'Reading the post…', weight: 2 },
  { label: 'Finding the location…', weight: 1 },
  { label: 'Asking which place it is…', weight: 2 },
  { label: 'Opening Google Maps…', weight: 1 },
  { label: 'Searching Maps…', weight: 2 },
  { label: 'Reading the place details…', weight: 2 },
  { label: 'Almost there…', weight: 1 },
];
const TOTAL_WEIGHT = STAGES.reduce((sum, stage) => sum + stage.weight, 0);

// The bar eases to REACH_AT over the expected time, then creeps slowly towards CREEP_TO until the answer
// comes back. A lookup that takes longer than expected never looks stuck.
const REACH_AT = 92;
const CREEP_TO = 97;
const CREEP_MS = 3000;
// The last lookup's real time on this device sets the next one's pace. Until there is one, this is used.
const TIME_KEY = 'reelmap.lookupMs';
const DEFAULT_MS = 12000;
const MIN_MS = 4000;
const MAX_MS = 30000;
// Filling to full once the answer is in.
const FILL_MS = 450;

function expectedMs() {
  try {
    const saved = Number(localStorage.getItem(TIME_KEY));
    return saved > 0 ? saved : DEFAULT_MS;
  } catch {
    // Storage can be blocked; the default pace is used.
    return DEFAULT_MS;
  }
}

function rememberMs(ms) {
  try {
    localStorage.setItem(TIME_KEY, String(Math.min(MAX_MS, Math.max(MIN_MS, Math.round(ms)))));
  } catch {
    // Storage can be blocked; the next lookup just uses the default pace.
  }
}

// Slow at the start, quick through the middle, slow into the end.
function easeInOut(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function progressAt(elapsed, total) {
  const fraction = Math.min(elapsed / total, 1);
  const percent = elapsed <= total
    ? REACH_AT * easeInOut(fraction)
    : CREEP_TO - (CREEP_TO - REACH_AT) * Math.exp(-(elapsed - total) / CREEP_MS);
  let start = 0;
  let label = STAGES[STAGES.length - 1].label;
  for (const stage of STAGES) {
    start += stage.weight / TOTAL_WEIGHT;
    if (fraction < start) {
      label = stage.label;
      break;
    }
  }
  return { percent, label };
}

// Shown while a reel is looked up. Mounted only during the lookup, so each one starts at zero.
// When done, it fills to full, then calls onDone so the form can open.
export default function LookupProgress({ done = false, onDone }) {
  const [view, setView] = useState({ percent: 0, label: STAGES[0].label });
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  // The percent on screen, and when the lookup was answered (with the percent it had reached).
  const shownRef = useRef(0);
  const finishRef = useRef(null);
  const startedRef = useRef(0);
  const totalRef = useRef(expectedMs());

  useEffect(() => {
    startedRef.current = performance.now();
    let frame;
    const tick = (now) => {
      const finish = finishRef.current;
      let next;
      if (finish) {
        const t = Math.min((now - finish.at) / FILL_MS, 1);
        next = { percent: finish.from + (100 - finish.from) * (1 - (1 - t) ** 3), label: 'Done' };
      } else {
        next = progressAt(now - startedRef.current, totalRef.current);
      }
      shownRef.current = next.percent;
      setView(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!done) return undefined;
    const now = performance.now();
    finishRef.current = { at: now, from: shownRef.current };
    // A saved lookup finishes at once; that isn't a real lookup's time, so it isn't remembered.
    const took = now - startedRef.current;
    if (took >= MIN_MS) rememberMs(took);
    const timer = setTimeout(() => onDoneRef.current?.(), FILL_MS + 150);
    return () => clearTimeout(timer);
  }, [done]);

  return (
    <div
      className="lookup-progress"
      role="progressbar"
      aria-label="Looking up the reel"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(view.percent)}
      aria-valuetext={view.label}
    >
      <div className="lookup-progress-label">{view.label}</div>
      <div className="lookup-progress-track">
        <div className="lookup-progress-fill" style={{ width: `${view.percent}%` }} />
      </div>
    </div>
  );
}
