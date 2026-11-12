import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Award, CalendarDays, CircleCheck, ClipboardPaste, MapPin } from 'lucide-react';
import Lantern from '../tour/Lantern';
import useAnchorRect from '../tour/useAnchorRect';
import { saveDemoHandoff } from '../lib/demoHandoff';
import '../tour/tour.css';
import './demo.css';
import { PLANS, SAMPLE, canGoBack, demoReducer, describeDemo, handoffFrom, initialState, suggestedTimes, timeLabel } from './demoFlow';

// A small picture of a map, drawn with shapes, so the demo never loads a real map.
function FakeMap() {
  return (
    <div className="demo-map" role="img" aria-label={`Map showing ${SAMPLE.name}`}>
      <span className="dm-park" /><span className="dm-road r1" /><span className="dm-road r2" /><span className="dm-road r3" /><span className="dm-river" />
      <span className="dm-pin" /><span className="dm-label">{SAMPLE.address}</span>
    </div>
  );
}

const Board = ({ emoji, name, children }) => (
  <section className="demo-board">
    <h2>{emoji} {name}</h2>
    {children}
  </section>
);

function Confetti() {
  const colors = ['#ffd23f', '#e5502a', '#4cc380', '#cdbfff'];
  return (
    <div className="demo-confetti" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => <span key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % 4], animationDelay: `${(i % 7) * 0.08}s` }} />)}
    </div>
  );
}

// The card that talks. Points at one thing (a hole in the dim layer), or sits in the middle for the first and last words.
function DemoTip({ s, d, dispatch, onExit, onSignUp, onLogin }) {
  const rect = useAnchorRect(d.target ? `[data-demo-t="${d.target}"]` : null);
  const tipRef = useRef(null);
  const [own, setOwn] = useState('');
  useEffect(() => { tipRef.current?.focus({ preventScroll: true }); }, [d.title, s.confirmSkip]);

  const pad = 6;
  const hole = rect && !d.center ? { left: Math.max(0, rect.left - pad), top: Math.max(0, rect.top - pad), width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  const dock = hole && hole.top + hole.height / 2 > window.innerHeight / 2 ? 'top' : 'bottom';
  const dot = s.step === 'paste' || s.step === 'saved' ? 1 : s.step === 'book' ? 2 : 0;
  const dots = dot > 0 && (
    <div className="demo-dots" aria-label={`Step ${dot} of 2`}>
      {[1, 2].map((n) => <i key={n} className={n === dot ? 'on' : n < dot ? 'done' : ''} />)}
    </div>
  );
  const bar = d.auto && <div className="demo-bar" aria-hidden="true" key={d.title}><i style={{ animationDuration: `${d.auto.ms}ms` }} /></div>;

  let tip;
  if (s.confirmSkip) {
    tip = (
      <div className={`demo-tip ${d.center ? 'center' : dock}`} role="alertdialog" aria-label="Skip the demo?" ref={tipRef} tabIndex={-1}>
        <Lantern size={44} pose="thinking" />
        <h3>Skip the demo?</h3>
        <p>You can sign up now, or come back and try it later.</p>
        <div className="demo-foot">
          <button type="button" className="demo-link" onClick={() => dispatch({ type: 'skip' })}>Skip demo</button>
          <span className="grow" />
          <button type="button" className="demo-btn go" onClick={() => dispatch({ type: 'keep' })}>Keep going</button>
        </div>
      </div>
    );
  } else if (d.center) {
    const booked = s.booked ? new Date(s.booked) : null;
    tip = (
      <div className="demo-tip center" role="dialog" aria-label={d.title} aria-live="polite" ref={tipRef} tabIndex={-1}>
        <Lantern size={64} pose={d.pose} />
        <h3>{d.title}</h3>
        <p>{d.body}</p>
        {s.step === 'planq' && (
          <>
            <div className="demo-plans">
              {PLANS.map((p) => <button key={p.name} type="button" className="demo-chip" onClick={() => dispatch({ type: 'plan', name: p.name, emoji: p.emoji })}>{p.emoji} {p.name}</button>)}
            </div>
            <form className="demo-own" onSubmit={(e) => { e.preventDefault(); dispatch({ type: 'plan', name: own.trim() || 'My plans', emoji: '📌' }); }}>
              <input className="demo-input" value={own} maxLength={24} placeholder="Or name your own" aria-label="Name your own collection" onChange={(e) => setOwn(e.target.value)} />
              <button type="submit" className="demo-btn go">Go</button>
            </form>
            <div className="demo-foot"><button type="button" className="demo-link" onClick={() => dispatch({ type: 'ask-skip' })}>Skip demo</button></div>
          </>
        )}
        {s.step === 'done' && (
          <>
            {booked && (
              <div className="demo-reward">
                <Award className="demo-medal" aria-hidden="true" />
                <div><b>First plan unlocked</b><small>{timeLabel(booked)} · {SAMPLE.name}</small><small>In {s.collEmoji} {s.collName}</small></div>
              </div>
            )}
            <div className="demo-foot center">
              <button type="button" className="demo-btn" onClick={() => dispatch({ type: 'restart' })}>Replay</button>
              <button type="button" className="demo-btn go" onClick={() => { saveDemoHandoff(handoffFrom(s)); onSignUp(); }}>Sign up</button>
            </div>
            <button type="button" className="demo-link" onClick={onLogin}>I already have an account</button>
          </>
        )}
        {s.step === 'welcome' && (
          <div className="demo-foot">
            <button type="button" className="demo-link soft" onClick={onExit}>‹ Back</button>
            <button type="button" className="demo-link" onClick={() => dispatch({ type: 'ask-skip' })}>Skip demo</button>
            <span className="grow" />
            <button type="button" className="demo-btn go" onClick={() => dispatch({ type: 'start' })}>Let's go</button>
          </div>
        )}
      </div>
    );
  } else {
    tip = (
      <div className={`demo-tip ${dock}`} role="dialog" aria-label={d.title} aria-live="polite" ref={tipRef} tabIndex={-1}>
        <div className="demo-tip-head">
          <Lantern size={40} pose={d.pose} />
          {dots}
          <span className="grow" />
          {canGoBack(s) && <button type="button" className="demo-link soft" onClick={() => dispatch({ type: 'back' })}>‹ Back</button>}
          <button type="button" className="demo-link soft" onClick={() => dispatch({ type: 'ask-skip' })}>Skip demo</button>
        </div>
        <h3>{d.title}</h3>
        <p>{d.body}</p>
        {d.next && <div className="demo-foot"><span className="grow" /><button type="button" className="demo-btn go" onClick={() => dispatch({ type: d.next })}>Next</button></div>}
        {bar}
      </div>
    );
  }

  return createPortal(
    <div className="tour-layer" data-tour-ui>
      {hole && (
        <>
          <div className="tour-dim" style={{ left: 0, top: 0, right: 0, height: hole.top }} />
          <div className="tour-dim" style={{ left: 0, top: hole.top + hole.height, right: 0, bottom: 0 }} />
          <div className="tour-dim" style={{ left: 0, top: hole.top, width: hole.left, height: hole.height }} />
          <div className="tour-dim" style={{ left: hole.left + hole.width, top: hole.top, right: 0, height: hole.height }} />
          <div className="tour-ring" style={hole} />
        </>
      )}
      {d.center || s.confirmSkip && !hole ? <div className="tour-backdrop">{tip}</div> : tip}
    </div>,
    document.body
  );
}

// The no-login demo: a pretend Home screen and place sheet, drawn with the app's own colours, and a short guided
// walk through saving a reel and booking it. It makes no network calls and saves nothing but the hand-off at the end.
export default function Demo({ onExit, onSignUp, onLogin }) {
  const [s, dispatch] = useReducer(demoReducer, undefined, initialState);
  const d = describeDemo(s);
  const times = useMemo(() => suggestedTimes(), []);
  const [confetti, setConfetti] = useState(false);

  // A tip that finishes itself moves on after a moment, unless the skip question is open.
  useEffect(() => {
    if (!d.auto || s.confirmSkip) return undefined;
    const id = setTimeout(() => dispatch({ type: d.auto.action }), d.auto.ms);
    return () => clearTimeout(id);
  }, [d.title, d.auto?.action, d.auto?.ms, s.confirmSkip]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!s.booked && s.step !== 'saved') return undefined;
    setConfetti(true);
    const id = setTimeout(() => setConfetti(false), 2000);
    return () => clearTimeout(id);
  }, [s.booked, s.step]);

  const waiting = s.step === 'book' && !s.placeOpen;
  const collection = s.collName ? { emoji: s.collEmoji, name: s.collName } : null;
  const place = (
    <button type="button" className="demo-place" data-demo-t="place" onClick={() => waiting && dispatch({ type: 'open' })}>
      <span className="demo-thumb"><MapPin aria-hidden="true" /></span>
      <span className="demo-place-text"><b>{SAMPLE.name}</b><small>Food · {SAMPLE.address}</small></span>
      <span className="demo-pills" aria-hidden="true">🔥{s.booked && <CalendarDays />}</span>
    </button>
  );

  return (
    <div className="demo">
      <div className="demo-col">
        <header className="demo-head">
          <span className="demo-brand">waylit maps<i>.</i></span>
        </header>
        <main className="demo-main">
          <div className="paste-card">
            <button type="button" className="paste-btn" data-demo-t="paste" aria-disabled={s.step !== 'paste' || s.paste !== 'idle'} onClick={() => s.step === 'paste' && s.paste === 'idle' && dispatch({ type: 'paste' })}>
              <ClipboardPaste className="ico" aria-hidden="true" /> Paste a reel link
            </button>
          </div>
          {s.paste === 'finding' && (
            <div className="demo-card demo-finding" data-demo-t="finding" role="status">
              <span className="demo-thumb">🎞️</span><b>Finding the place in this reel…</b><span className="spinner" aria-hidden="true" />
            </div>
          )}
          <Board emoji="📥" name="TBD"><p className="demo-empty">Nothing here yet. Saved places land here.</p></Board>
          {collection && <Board emoji={collection.emoji} name={collection.name}>{s.saved ? place : <p className="demo-empty">Nothing here yet.</p>}</Board>}
        </main>
        <nav className="demo-nav" aria-hidden="true"><span>Home</span><span className="demo-plus">+</span><span>Map</span></nav>
      </div>

      {s.placeOpen && (
        <div className="demo-sheet" role="dialog" aria-label={SAMPLE.name}>
          <div className="demo-sheet-head">
            <span className="demo-thumb"><MapPin aria-hidden="true" /></span>
            <div><b>{SAMPLE.name}</b><small>{SAMPLE.address}</small></div>
          </div>
          {s.booked && (
            <div className="booked-card">
              <div className="booked-label"><CircleCheck aria-hidden="true" /> Booked</div>
              <div className="booked-when">{timeLabel(new Date(s.booked))}</div>
              <div className="booked-note">Notification sent to the collection</div>
            </div>
          )}
          <FakeMap />
          {!s.booked && s.bstep === 0 && (
            <button type="button" className="step-btn primary full-width" data-demo-t="plan" onClick={() => dispatch({ type: 'wizard' })}>Find a time &amp; book</button>
          )}
          {!s.booked && s.bstep === 1 && (
            <div className="demo-card">
              <b>Find a time &amp; book</b>
              <p className="demo-note">We can't see the venue's tables. Pick a time to try, book with the venue yourself, then tell us what you got.</p>
              <div className="tp-slots" data-demo-t="times">
                {times.map((t) => <button key={t.iso} type="button" className="tp-slot" aria-pressed={s.picked === t.iso} onClick={() => dispatch({ type: 'pick', iso: t.iso })}>{t.label}</button>)}
              </div>
              {s.picked && (
                <button type="button" className="step-btn primary full-width" data-demo-t="continue" onClick={() => dispatch({ type: 'continue' })}>
                  Continue with {timeLabel(new Date(s.picked))}
                </button>
              )}
            </div>
          )}
          {!s.booked && s.bstep === 2 && (
            <div className="demo-card">
              <b>Did you book it?</b>
              <div className="demo-when">{timeLabel(new Date(s.picked))}</div>
              <button type="button" className="step-btn primary full-width" data-demo-t="confirm" onClick={() => dispatch({ type: 'confirm' })}>Confirm booking</button>
              <p className="demo-note">Confirming sends a notification to the collection.</p>
            </div>
          )}
        </div>
      )}

      {confetti && <Confetti />}
      <DemoTip s={s} d={d} dispatch={dispatch} onExit={onExit} onSignUp={onSignUp} onLogin={onLogin} />
    </div>
  );
}
