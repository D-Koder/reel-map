import React, { useEffect, useRef, useState } from 'react';

// The lookup is one request, so the server doesn't report its steps. The bar moves through them on
// estimated times, and holds below full until the answer comes back.
const STAGES = [
  { label: 'Opening the reel', ms: 1200 },
  { label: 'Reading the reel', ms: 3500 },
  { label: 'Opening Google Maps', ms: 1500 },
  { label: 'Reading Google Maps', ms: 5000 },
];
const TOTAL_MS = STAGES.reduce((sum, stage) => sum + stage.ms, 0);
// Stops here until the lookup answers, so the bar never looks done before it is.
const HOLD_AT = 95;

function stageAt(elapsed) {
  let start = 0;
  for (const stage of STAGES) {
    if (elapsed < start + stage.ms) return stage.label;
    start += stage.ms;
  }
  return 'Finishing up';
}

// Shown while a reel is looked up. Mounted only during the lookup, so each one starts at zero.
// When done, it fills to full, then calls onDone so the form can open.
export default function LookupProgress({ done = false, onDone }) {
  const [elapsed, setElapsed] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (done) return undefined;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 100);
    return () => clearInterval(timer);
  }, [done]);

  // Long enough for the bar to reach full before the form replaces it.
  useEffect(() => {
    if (!done) return undefined;
    const timer = setTimeout(() => onDoneRef.current?.(), 400);
    return () => clearTimeout(timer);
  }, [done]);

  const percent = done ? 100 : Math.min(elapsed / TOTAL_MS, 1) * HOLD_AT;
  const label = done ? 'Done' : stageAt(elapsed);

  return (
    <div
      className="lookup-progress"
      role="progressbar"
      aria-label="Looking up the reel"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-valuetext={label}
    >
      <div className="lookup-progress-label">{label}…</div>
      <div className="lookup-progress-track">
        <div className="lookup-progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
