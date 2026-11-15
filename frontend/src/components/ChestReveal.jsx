import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { CHEST_BACK, CHEST_FRONT, MEDAL } from '../lib/chestArt';

const SPARK_COLOURS = ['#ffd23f', '#fff3b0', '#ff9f1c', '#ffffff', '#e8502a'];
const CONFETTI_COLOURS = ['#ffd23f', '#e8502a', '#0ea5e9', '#16a34a', '#e0336a', '#7c3aed'];
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// The treasure chest for claiming a badge or a level prize. Same as the end of the no-login demo, nicer:
//   closed  the chest bobs and sparkles ("Tap to open your reward!")
//   shaking it squashes, then shakes harder, with light leaking from under the lid
//   open    the lock pops off, the lid flips up, a flash and a burst of sparks, the medal rises, spinning, in front of the lid
// `icon` is drawn on the medal. `children` is what is revealed under the chest once it is open (the name, XP, buttons).
export default function ChestReveal({ icon, onClose, children }) {
  const [phase, setPhase] = useState('closed');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const sparks = useRef(Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2 + Math.random() * 0.3;
    const d = 90 + Math.random() * 90;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 30, c: SPARK_COLOURS[i % 5], d: Math.random() * 0.12, t: 0.7 + Math.random() * 0.5 };
  })).current;
  const confetti = useRef(Array.from({ length: 44 }, (_, i) => ({ left: Math.random() * 100, c: CONFETTI_COLOURS[i % 6], d: Math.random() * 0.5, t: 1.5 + Math.random() }))).current;

  const open = () => {
    if (phase !== 'closed') return;
    navigator.vibrate?.([30, 40, 30, 40, 30]);
    const burst = () => { navigator.vibrate?.([20, 40, 60]); setPhase('open'); };
    if (reduced()) { burst(); return; }
    setPhase('shaking');
    timer.current = setTimeout(burst, 950);
  };

  return (
    <div className="cr-scrim" role="dialog" aria-modal="true" aria-label="Reward chest">
      <div className={`cr-stage ${phase === 'closed' ? 'closed' : phase === 'shaking' ? 'shaking' : 'open'}`}>
        <button type="button" className="cr-close" aria-label="Close" onClick={onClose}><X aria-hidden="true" /></button>
        <span className="cr-rays" aria-hidden="true" />
        <span className="cr-glow" aria-hidden="true" />
        {[[18, 70], [150, 50], [40, 14], [128, 104]].map(([x, y], i) => (
          <i key={i} className="cr-idle" aria-hidden="true" style={{ left: `calc(50% - 85px + ${x}px)`, top: `${y + 136}px`, animationDelay: `${i * 0.45}s` }} />
        ))}
        <button type="button" className="cr-box" aria-label="Open the chest" onClick={open} autoFocus>
          <span className="cr-box-in">
            <span dangerouslySetInnerHTML={{ __html: CHEST_BACK }} />
            <span className="cr-prize">
              <span dangerouslySetInnerHTML={{ __html: MEDAL }} />
              <span className="cr-medal-icon">{icon}</span>
              <span className="cr-sheen" />
            </span>
            <span dangerouslySetInnerHTML={{ __html: CHEST_FRONT }} />
          </span>
        </button>
        {phase === 'closed' && <span className="cr-hint">Tap to open your reward!</span>}
        <span className="cr-flash" aria-hidden="true" />
        {phase === 'open' && (
          <span className="cr-spark" aria-hidden="true">
            {sparks.map((s, i) => <i key={i} style={{ '--x': `${s.x}px`, '--y': `${s.y}px`, '--c': s.c, '--d': `${s.d}s`, '--t': `${s.t}s` }} />)}
          </span>
        )}
        {phase === 'open' && <div className="cr-reveal">{children}</div>}
      </div>
      {phase === 'open' && !reduced() && (
        <div className="cr-conf" aria-hidden="true">
          {confetti.map((c, i) => <span key={i} style={{ left: `${c.left}%`, background: c.c, animationDelay: `${c.d}s`, animationDuration: `${c.t}s` }} />)}
        </div>
      )}
    </div>
  );
}
