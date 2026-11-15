import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock } from 'lucide-react';
import { BADGES } from '../lib/achievements';
import { PRIZES, badgeXp, levelInfo } from '../lib/levels';
import { QUESTS } from '../lib/quests';
import { setSound, sfx, soundOn } from './sfx';
import DemoSignUp from './DemoSignUp';
import Lantern from '../tour/Lantern';
import useAnchorRect from '../tour/useAnchorRect';
import HomeScreen from '../components/HomeScreen';
import PinModal from '../components/PinModal';
import ReelInbox from '../components/ReelInbox';
import PasteReelCard from '../components/PasteReelCard';
import { AppHeader, BottomNav } from '../components/AppChrome';
import { SAMPLE_DETAILS, TOUR_MARK } from '../tour/steps';
import { markDemoDone, saveDemoHandoff } from '../lib/demoHandoff';
import '../tour/tour.css';
import './demo.css';
import { PLANS, SAMPLE, canGoBack, demoReducer, describeDemo, handoffFrom, initialState, timeLabel } from './demoFlow';

const ME = 'demo-user';
const noop = () => {};
const me = { id: ME, display_name: 'You', avatar: '🙂', role: 'owner' };

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
  const rect = useAnchorRect(d.target, d.title);
  const hintRect = useAnchorRect(d.hintTarget || null); // a smaller thing inside the spotlight that the Tap hint sits on
  const tipRef = useRef(null);
  const [own, setOwn] = useState('');
  const [who, setWho] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [agreeErr, setAgreeErr] = useState(false);
  const [sound, setSoundState] = useState(soundOn());
  const begin = () => {
    if (!agreed) { setAgreeErr(true); return; }
    dispatch({ type: 'start', name: who, agreed: true });
  };
  // What the badge is worth, read from the same data as the Achievements screen, so the numbers never drift.
  // A new account starts on Level 1: Test Driver is a small head start, and the starter quests do the rest.
  const start = levelInfo(badgeXp('demo'));
  const nextPrize = PRIZES.find((p) => p.level > start.level);
  const questCount = QUESTS.length;
  const questXp = QUESTS.reduce((sum, q) => sum + q.xp, 0);
  const [signing, setSigning] = useState(false); // the inline sign-up form is open
  const [chest, setChest] = useState('closed'); // closed, shaking, open. The badge inside is only kept once there is an account
  const openChest = () => {
    if (chest !== 'closed') return;
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setChest('open'); sfx.open(); return; }
    setChest('shaking');
    sfx.rumble();
    setTimeout(() => { setChest('open'); sfx.open(); }, 650);
  };
  useEffect(() => { tipRef.current?.focus({ preventScroll: true }); }, [d.title, s.confirmSkip]);

  const pad = 6;
  const real = rect && !d.center ? { left: Math.max(0, rect.left - pad), top: Math.max(0, rect.top - pad), width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  // When a new thing is pointed at, the dim starts open (the whole screen) and closes in on it.
  const spot = real ? d.target : null;
  const [settled, setSettled] = useState(null); // the target the dim has finished closing on
  const [glided, setGlided] = useState(null); // the target whose glide has run its course
  useEffect(() => {
    if (!spot) { setSettled(null); setGlided(null); return undefined; }
    let raf2;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setSettled(spot)); });
    const done = setTimeout(() => setGlided(spot), 750);
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); clearTimeout(done); };
  }, [spot]);
  const opening = Boolean(spot) && settled !== spot;
  const closing = Boolean(spot) && glided !== spot;
  const hole = real && opening ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight } : real;
  const dock = real && real.top + real.height / 2 > window.innerHeight / 2 ? 'top' : 'bottom';
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
      <div className="demo-tip center" role="dialog" aria-label={d.title} aria-live="polite" ref={tipRef} tabIndex={-1} key={d.title}>
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
              <button type="button" className={`chest-stage ${chest === 'open' ? 'open' : chest === 'shaking' ? 'shaking' : 'closed'}`} onClick={openChest} disabled={chest === 'open'} aria-label={chest === 'open' ? 'Test Driver badge unlocked. Sign up to claim it.' : 'Tap to open your reward chest'}>
                <span className="chest-rays" aria-hidden="true" />
                <span className="chest-box" aria-hidden="true">
                  {chest !== 'open' && <><i className="chest-glint a" /><i className="chest-glint b" /><i className="chest-glint c" /></>}
                  <img className="chest-img chest-img-closed" src="/art/chest/closed.webp" alt="" draggable="false" />
                  <img className="chest-img chest-img-open" src="/art/chest/open.webp" alt="" draggable="false" />
                </span>
                <span className="chest-prize" aria-hidden="true">
                  <svg viewBox="0 0 64 76">
                    <path d="M18 40 L10 70 L22 63 L28 74 L34 46 Z" fill="#e8502a" stroke="#1a1a18" strokeWidth="3" strokeLinejoin="round" />
                    <path d="M46 40 L54 70 L42 63 L36 74 L30 46 Z" fill="#c63d1b" stroke="#1a1a18" strokeWidth="3" strokeLinejoin="round" />
                    <circle cx="32" cy="30" r="25" fill="#ffd23f" stroke="#1a1a18" strokeWidth="3.5" />
                    <circle cx="32" cy="30" r="17.5" fill="#ffe680" stroke="#1a1a18" strokeWidth="2.5" />
                    <path d="M32 18.5l3.4 7.2 7.9 1-5.8 5.4 1.5 7.8L32 36l-7 3.9 1.5-7.8-5.8-5.4 7.9-1z" fill="#e8502a" stroke="#1a1a18" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                </span>
                {chest === 'open' ? (
                  <span className="chest-reveal">
                    <span className="chest-new">New badge · 1 of {BADGES.length}</span>
                    <span className="chest-ribbon">Test Driver</span>
                    <span className="chest-xp"><span>+{badgeXp('demo')} XP</span><span>New title</span><span>Free frame</span></span>
                    <span className="chest-lock"><Lock className="demo-lock" aria-hidden="true" /> Sign up to claim it</span>
                  </span>
                ) : (
                  <>
                    <span className="chest-hint">Tap to open your reward!</span>
                    <span className="chest-plan">{timeLabel(booked)} · {SAMPLE.name} · {s.collEmoji} {s.collName}</span>
                  </>
                )}
              </button>
            )}
            {booked && chest === 'open' && !signing && (
              <div className="demo-after">
                <div className="demo-lvl">
                  <div className="demo-lvl-top"><span>Level {start.level} · {start.cur} of {start.size} XP</span><span>+{badgeXp('demo')} XP</span></div>
                  <div className="demo-lvl-bar"><i style={{ '--fill': `${start.pct}%` }} /></div>
                  <small>🎁 Next: Level {start.level + 1}{nextPrize && nextPrize.level === start.level + 1 ? ` unlocks ${nextPrize.name}` : ''}</small>
                </div>
                <div className="demo-nextbadge">
                  <span className="demo-nextbadge-ic" aria-hidden="true">🧭</span>
                  <div><b>{questCount} starter quests</b><small>Learn the app and earn {questXp} more XP.</small></div>
                </div>
              </div>
            )}
            {signing ? (
              <DemoSignUp name={s.name} onBack={() => setSigning(false)} onLogin={onLogin} beforeSubmit={() => saveDemoHandoff(handoffFrom(s))} />
            ) : (
              <>
            <div className="demo-foot center">
              <button type="button" className="demo-btn" onClick={() => { setChest('closed'); setSigning(false); dispatch({ type: 'restart' }); }}>Replay</button>
              {booked && chest !== 'open'
                ? <button type="button" className="demo-btn go" onClick={openChest} disabled={chest === 'shaking'}>Open chest</button>
                : <button type="button" className="demo-btn go" onClick={() => { if (booked) { setSigning(true); return; } saveDemoHandoff(handoffFrom(s)); onSignUp(); }}>{booked ? 'Sign up to claim' : 'Sign up'}</button>}
            </div>
            <div className="demo-links">
              <button type="button" className="demo-link" onClick={onLogin}>I already have an account</button>
              <button type="button" className="demo-link soft" aria-pressed={sound} onClick={() => { setSound(!sound); setSoundState(!sound); }}>Sound: {sound ? 'on' : 'off'}</button>
            </div>
              </>
            )}
          </>
        )}
        {s.step === 'welcome' && (
          <>
            <form className="demo-own demo-start" onSubmit={(e) => { e.preventDefault(); begin(); }}>
              <input className="demo-input" value={who} maxLength={30} placeholder="Your name (optional)" aria-label="Your name" autoComplete="given-name" enterKeyHint="go" onChange={(e) => setWho(e.target.value)} />
              <label className="demo-agree">
                <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setAgreeErr(false); }} />
                <span>I'm 13 or older and agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span>
              </label>
              {agreeErr && <div className="demo-agree-err" role="alert">Tick the box to confirm you're 13 or older and agree to the Terms and Privacy Policy.</div>}
            </form>
            <div className="demo-foot">
              <button type="button" className="demo-link soft" onClick={onExit}>‹ Back</button>
              <button type="button" className="demo-link" onClick={() => dispatch({ type: 'ask-skip' })}>Skip demo</button>
              <span className="grow" />
              <button type="button" className="demo-btn go" onClick={begin}>Let's go</button>
            </div>
          </>
        )}
      </div>
    );
  } else {
    tip = (
      <div className={`demo-tip ${dock}`} role="dialog" aria-label={d.title} aria-live="polite" ref={tipRef} tabIndex={-1} key={d.title}>
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
    <div className={`tour-layer demo-layer${closing ? ' closing' : ''}`} data-tour-ui>
      {hole && (
        <>
          <div className="tour-dim" style={{ left: 0, top: 0, right: 0, height: hole.top }} />
          <div className="tour-dim" style={{ left: 0, top: hole.top + hole.height, right: 0, bottom: 0 }} />
          <div className="tour-dim" style={{ left: 0, top: hole.top, width: hole.left, height: hole.height }} />
          <div className="tour-dim" style={{ left: hole.left + hole.width, top: hole.top, right: 0, height: hole.height }} />
          <div className="tour-ring" style={{ ...hole, opacity: opening ? 0 : 1 }} />
        </>
      )}
      {d.hint && real && !opening && !s.confirmSkip && (hintRect ? (
        <div className="demo-hint on-button" style={{ left: hintRect.left + hintRect.width / 2, top: hintRect.top + hintRect.height / 2, '--below': `${hintRect.height / 2 + 8}px` }} aria-hidden="true"><i /><i /><span>Tap</span></div>
      ) : (
        <div className="demo-hint" style={{ left: real.left + real.width / 2, top: real.top + real.height - 6 }} aria-hidden="true"><i /><i /><span>Tap</span></div>
      ))}
      {d.center || s.confirmSkip && !hole ? <div className="tour-backdrop">{tip}</div> : tip}
    </div>,
    document.body
  );
}

// What the real place sheet is showing, read off the screen: the demo doesn't own that sheet's inner steps.
function useSheetProbe(active) {
  const [dom, setDom] = useState({ wizard: null, timePicked: false, dayPicked: false });
  useEffect(() => {
    if (!active) { setDom({ wizard: null, timePicked: false, dayPicked: false }); return undefined; }
    const read = () => {
      const title = document.querySelector('.checklist-step .step-title')?.textContent ?? '';
      const wizard = /^Did you book/.test(title) ? 'confirm' : document.querySelector('.step-saved') ? 'booked' : title ? 'time' : null;
      const timePicked = Boolean(document.querySelector('.time-picker .step-btn.primary'));
      const dayPicked = Boolean(document.querySelector('.tp-day[aria-pressed="true"]'));
      setDom((now) => (now.wizard === wizard && now.timePicked === timePicked && now.dayPicked === dayPicked ? now : { wizard, timePicked, dayPicked }));
    };
    read();
    const id = setInterval(read, 150);
    return () => clearInterval(id);
  }, [active]);
  return dom;
}

// The no-login demo. It draws the app's own Home, inbox card, place sheet, header and tab bar (the same components),
// fed with a pretend collection and place that live only in this tab. It makes no network calls of its own and
// saves nothing but the hand-off at the end.
export default function Demo({ onExit, onSignUp, onLogin }) {
  const [s, dispatch] = useReducer(demoReducer, undefined, initialState);
  const [confetti, setConfetti] = useState(false);
  const [toast, setToast] = useState(null);
  const dom = useSheetProbe(s.placeOpen);
  const d = describeDemo(s, dom);

  // Finishing the demo with a booked time wins the Test Driver badge, once there is an account to hold it.
  useEffect(() => { if (s.step === 'done' && s.booked) markDemoDone(); }, [s.step, s.booked]);

  const showToast = useCallback((message) => {
    // Tapping Done on the booked sheet is the last step: move on. Other "Step n complete" toasts would sit on the button the tip points at.
    if (message === 'Step 3 complete') { dispatch({ type: 'booked-next' }); return; }
    if (/^Step \d complete/.test(message)) return;
    setToast({ message, key: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(id);
  }, [toast]);

  // A tip that finishes itself moves on after a moment, unless the skip question is open.
  useEffect(() => {
    if (!d.auto || s.confirmSkip) return undefined;
    const id = setTimeout(() => dispatch({ type: d.auto.action }), d.auto.ms);
    return () => clearTimeout(id);
  }, [d.title, d.auto?.action, d.auto?.ms, s.confirmSkip]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!s.booked && s.step !== 'saved') return undefined;
    setConfetti(true);
    const id = setTimeout(() => setConfetti(false), 2600);
    return () => clearTimeout(id);
  }, [s.booked, s.step]);

  const collections = useMemo(() => {
    const list = [{ id: 'demo-tbd', name: 'TBD', emoji: '📥', isPrivate: false, ownerId: ME, isInbox: true, members: [me] }];
    if (s.collName) list.push({ id: 'demo-coll', name: s.collName, emoji: s.collEmoji, isPrivate: false, ownerId: ME, members: [me] });
    return list;
  }, [s.collName, s.collEmoji]);
  const membersOf = useMemo(() => Object.fromEntries(collections.map((c) => [c.id, c.members])), [collections]);

  const places = useMemo(() => (s.saved ? [{
    id: 'demo-place',
    name: SAMPLE_DETAILS.name,
    address: SAMPLE_DETAILS.address,
    lat: SAMPLE_DETAILS.latitude,
    lng: SAMPLE_DETAILS.longitude,
    hours: SAMPLE_DETAILS.hours,
    category: 'food',
    custom_info: TOUR_MARK,
    // Pretend contact details so the call and website icons show. They go nowhere in the demo.
    phone: '(03) 5550 0123',
    website_url: 'https://example.com',
    collection_id: 'demo-coll',
    collectionIds: ['demo-coll'],
    added_by: ME,
    added_at: new Date().toISOString(),
    reactions: {},
    reviews: [],
    booking: s.booked ? { id: 'demo-booking', planned_at: s.booked, booked_by: ME, done_at: null } : null,
  }] : []), [s.saved, s.booked]);
  const openPin = s.placeOpen ? places[0] : null;

  const inboxItems = useMemo(() => {
    if (s.paste === 'finding') return [{ id: 'demo-reel', url: 'demo', status: 'saving' }];
    if (s.paste === 'confirm') return [{ id: 'demo-reel', url: 'demo', status: 'confirm', name: SAMPLE.name, address: SAMPLE.address }];
    return [];
  }, [s.paste]);

  const banner = (
    <>
      <PasteReelCard onSave={noop} showToast={showToast} onPaste={() => s.step === 'paste' && s.paste === 'idle' && dispatch({ type: 'paste' })} />
      <ReelInbox
        items={inboxItems}
        onFinish={noop}
        onRetry={noop}
        onDismiss={noop}
        onConfirm={() => dispatch({ type: 'save' })}
        onReject={() => dispatch({ type: 'verify' })}
        onSaveListed={noop}
      />
    </>
  );

  return (
    <div className="app demo-app">
      <AppHeader profile={me} />
      <main className="content">
        <section className="panel panel-home active">
          <HomeScreen
            userId={ME}
            places={places}
            collections={collections}
            banner={banner}
            membersOf={membersOf}
            streak={0}
            onOpenPin={() => s.step === 'book' && dispatch({ type: 'open' })}
            onReorder={noop}
            onAddPlace={noop}
            showToast={showToast}
            onCreateCollection={noop}
            canEdit={() => true}
            onCopyPlaces={noop}
            onDeletePlaces={noop}
            onMovePlaces={noop}
            onCreateSample={noop}
            onOpenSettings={noop}
          />
        </section>
      </main>
      <BottomNav screen="home" onScreen={noop} onAdd={noop} addDisabled={!s.collName} />

      {openPin && (
        <PinModal
          key={openPin.id}
          place={openPin}
          userId={ME}
          members={[me]}
          onSetVibe={noop}
          onBook={async (plannedAt) => { dispatch({ type: 'booked', iso: new Date(plannedAt).toISOString() }); return true; }}
          onMarkDone={noop}
          onCancelBooking={async () => false}
          onSaveReview={noop}
          onDeleteReview={noop}
          onReportReview={noop}
          onEdit={noop}
          onDelete={noop}
          canEdit
          onClose={() => dispatch({ type: 'close' })}
          showToast={showToast}
        />
      )}

      {toast && <div key={toast.key} className="toast" role="status"><span>{toast.message}</span></div>}
      {confetti && <Confetti />}
      <DemoTip s={s} d={d} dispatch={dispatch} onExit={onExit} onSignUp={onSignUp} onLogin={onLogin} />
    </div>
  );
}
