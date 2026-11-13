import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { onTour } from './events';
import { enableFridayPick, isPushSupported } from '../lib/push';
import { clearDemoHandoff, readDemoHandoff } from '../lib/demoHandoff';
import { startPlan } from './startPlan';
import { SAMPLE_PREFIX, TOUR_MARK, describe, enter, hasDot, keepTrue, needsPlace, stepsFor } from './steps';
import Lantern from './Lantern';
import useAnchorRect from './useAnchorRect';
import './tour.css';

const isIosDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const has = (selector) => Boolean(document.querySelector(selector));

function Overlay({ stepId, desc, dot, dotCount, canBack, onBack, onNext, onSkipTour, onSkipStep, onExtra, onFinish }) {
  const rect = useAnchorRect(desc.anchor);
  const [confirming, setConfirming] = useState(false);
  const tipRef = useRef(null);
  const center = stepId === 'welcome' || stepId === 'done';

  useEffect(() => { setConfirming(false); tipRef.current?.focus({ preventScroll: true }); }, [stepId]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setConfirming((v) => !v); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pad = 6;
  const hole = rect && !center ? { left: Math.max(0, rect.left - pad), top: Math.max(0, rect.top - pad), width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  const dock = hole && hole.top + hole.height / 2 > window.innerHeight / 2 ? 'top' : 'bottom';

  const dots = dotCount > 0 && dot > 0 && (
    <div className="tour-dots" aria-label={`Step ${dot} of ${dotCount}`}>
      {Array.from({ length: dotCount }, (_, i) => <i key={i} className={i + 1 === dot ? 'on' : i + 1 < dot ? 'done' : ''} />)}
    </div>
  );

  let tip;
  if (confirming) {
    tip = (
      <div className={`tour-tip ${center ? 'center' : dock}`} role="alertdialog" aria-label="Skip the tour?" ref={tipRef} tabIndex={-1}>
        <h3 className="tour-title">Skip the tour?</h3>
        <p className="tour-body">You can restart it any time in Settings, under Replay tour.</p>
        <div className="tour-bar"><button type="button" className="tour-btn" onClick={() => setConfirming(false)}>Keep going</button><span className="tour-grow" /><button type="button" className="tour-btn go" onClick={onSkipTour}>Skip tour</button></div>
      </div>
    );
  } else {
    tip = (
      <div className={`tour-tip ${center ? 'center' : dock}`} role="dialog" aria-label={desc.title} aria-live="polite" ref={tipRef} tabIndex={-1}>
        <div className="tour-head" style={center ? { flexDirection: 'column' } : undefined}><Lantern />{dots}</div>
        <h3 className="tour-title">{desc.title}</h3>
        <p className="tour-body">{desc.body}</p>
        {desc.hint && <div className="tour-hint">{desc.hint}</div>}
        {desc.extra && <button type="button" className="tour-extra" onClick={() => onExtra(desc.extra.action)}>{desc.extra.label}</button>}
        {stepId === 'welcome' && (
          <div className="tour-bar"><button type="button" className="tour-link" onClick={() => setConfirming(true)}>Skip tour</button><span className="tour-grow" /><button type="button" className="tour-btn go" onClick={onNext}>Let's go</button></div>
        )}
        {stepId === 'done' && (
          <div className="tour-bar" style={{ justifyContent: 'center' }}><button type="button" className="tour-btn go" onClick={onFinish}>Start using Waylit</button></div>
        )}
        {!center && (
          <div className="tour-bar">
            {canBack && <button type="button" className="tour-link back" onClick={onBack} aria-label="Back">‹ Back</button>}
            <button type="button" className="tour-link" onClick={() => setConfirming(true)}>Skip tour</button>
            <span className="tour-grow" />
            {desc.needsNext
              ? <button type="button" className="tour-btn go" onClick={onNext}>Next</button>
              : <button type="button" className="tour-link" onClick={onSkipStep}>{desc.skipLabel || 'Skip step'}</button>}
          </div>
        )}
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
      {center ? <div className="tour-backdrop">{tip}</div> : tip}
    </div>,
    document.body
  );
}

// Runs the first-run tour: decides when it starts, which step it is on, remembers that on the account, and removes
// the sample place when it ends. It reads the app's state through props and drives the app through `actions`.
export default function TourHost({
  userId, name, loading, blocked, waitingForInvite, joinedByInvite,
  places, collections, inboxItems, isWide, screen, openPinId, editPinId, settingsOpen, shareOpen, notificationsOpen, actions,
}) {
  // undefined while loading, null for a new account, 'missing' until the database has the column, else what was saved.
  const [saved, setSaved] = useState(undefined);
  const [t, setT] = useState(null);
  // Re-checks the page a few times a second: a card can appear on screen a moment after the app's state changes.
  const [tick, setTick] = useState(0);
  const actionsRef = useRef(actions);
  const removing = useRef(new Set());
  const creatingDemoCollection = useRef(false);
  actionsRef.current = actions;

  useEffect(() => {
    let off = false;
    supabase.from('profiles').select('tour').eq('id', userId).maybeSingle()
      .then(({ data, error }) => { if (!off) setSaved(error ? 'missing' : data?.tour ?? null); });
    return () => { off = true; };
  }, [userId]);

  // An account that already has a tour state is not new, so a leftover demo hand-off on this device is not for it.
  useEffect(() => { if (saved && saved !== 'missing') clearDemoHandoff(); }, [saved]);

  const persist = useCallback((value) => { supabase.from('profiles').update({ tour: value }).eq('id', userId).then(() => {}, () => {}); }, [userId]);

  const start = useCallback((variant, collName = null) => {
    setT({ variant, step: 'welcome', history: [], startPlaceIds: places.map((p) => p.id), startCollections: collections.length, placeCollectionAtStart: null, placeId: null, inviteSent: false, collName });
  }, [places, collections]);

  // New accounts start on their own. A tour left half-done carries on where it was.
  useEffect(() => {
    if (t || saved === undefined || saved === 'missing' || loading || blocked || waitingForInvite) return;
    if (saved === null) {
      // A new account that tried the no-login demo first: make the collection they chose, and show only what is left.
      const plan = startPlan({ joinedByInvite, handoff: readDemoHandoff(), collections, userId, creating: creatingDemoCollection.current });
      if (plan.create) {
        creatingDemoCollection.current = true;
        const handoff = readDemoHandoff();
        Promise.resolve(actionsRef.current.createCollection(handoff.collName, handoff.collEmoji)).catch(() => {}).finally(() => clearDemoHandoff());
      } else if (plan.clear) clearDemoHandoff();
      start(plan.variant, plan.collName);
    } else if (saved && !saved.done && saved.step) setT({ history: [], inviteSent: false, startPlaceIds: [], startCollections: collections.length, placeCollectionAtStart: null, placeId: null, ...saved });
  }, [t, saved, loading, blocked, waitingForInvite, joinedByInvite, start, collections.length]);

  useEffect(() => onTour((type) => {
    if (type === 'replay') start('main');
    if (type === 'invite-sent') setT((s) => (s ? { ...s, inviteSent: true } : s));
  }), [start]);

  // The place the tour is about: the first one that was not there when it started.
  const place = useMemo(() => {
    if (!t) return null;
    if (t.placeId) return places.find((p) => p.id === t.placeId) ?? null;
    if (t.variant === 'main' && t.step !== 'welcome') return places.find((p) => !t.startPlaceIds.includes(p.id)) ?? null;
    return null;
  }, [t, places]);
  useEffect(() => { if (t && place && !t.placeId) setT((s) => (s ? { ...s, placeId: place.id } : s)); }, [t, place]);

  const votablePlace = useMemo(() => places.find((p) => p.added_by !== userId) ?? places[0] ?? null, [places, userId]);
  const ctx = useMemo(() => t && ({
    variant: t.variant, name, userId, isWide, isIos: isIosDevice(), standalone: isStandalone(),
    pushState: isPushSupported() ? Notification.permission : 'unsupported',
    place, placeKey: place ? `${place.collection_id}:${place.id}` : null,
    hasVotablePlace: Boolean(votablePlace), votablePlace,
    collections, startCollections: t.startCollections, placeCollectionAtStart: t.placeCollectionAtStart,
    collName: t.collName,
    shareCollectionId: t.variant === 'demo'
      ? collections.find((c) => c.name === t.collName && c.ownerId === userId)?.id ?? null
      : place?.collection_id ?? collections[0]?.id ?? null,
    openPinId, editPinId, settingsOpen, shareOpen, notificationsOpen, screen, inboxItems, inviteSent: t.inviteSent, has,
  }), [t, name, userId, isWide, place, votablePlace, collections, openPinId, editPinId, settingsOpen, shareOpen, notificationsOpen, screen, inboxItems, tick]);

  const list = useMemo(() => (ctx ? stepsFor(t.variant, ctx) : []), [ctx, t?.variant]); // eslint-disable-line react-hooks/exhaustive-deps
  const idx = t ? list.indexOf(t.step) : -1;
  const desc = ctx && idx >= 0 ? describe(t.step, ctx) : null;

  const goTo = useCallback((step, back = false) => {
    setT((s) => {
      if (!s) return s;
      const next = { ...s, step, history: back ? s.history.slice(0, -1) : [...s.history, s.step] };
      persist({ v: 1, done: false, variant: next.variant, collName: next.collName ?? null, step, placeId: next.placeId, startPlaceIds: next.startPlaceIds, startCollections: next.startCollections, placeCollectionAtStart: next.placeCollectionAtStart, inviteSent: next.inviteSent });
      return next;
    });
  }, [persist]);
  // The next step, passing over ones that need a place when the person has none.
  const next = useCallback(() => {
    let i = idx + 1;
    while (list[i] && needsPlace(list[i]) && !place) i += 1;
    if (idx >= 0 && list[i]) goTo(list[i]);
  }, [idx, list, goTo, place]);

  // Cleans up and closes the tour. The sample place and any sample reel waiting in the inbox go; a real place stays.
  const end = useCallback(async (skipped) => {
    const a = actionsRef.current;
    a.closePin(); a.closeEdit(); a.closeSettings(); a.closeShare(); a.closeNotifications();
    inboxItems.filter((i) => i.url?.startsWith(SAMPLE_PREFIX)).forEach((i) => a.dismissInbox(i.id));
    const samples = places.filter((p) => p.custom_info === TOUR_MARK);
    samples.forEach((p) => removing.current.add(p.id));
    await Promise.all(samples.map((p) => a.deletePlace(p.collection_id, p.id)));
    setT(null);
    const value = { v: 1, done: true, skipped: Boolean(skipped), at: new Date().toISOString() };
    setSaved(value);
    persist(value);
    if (samples.length) a.showToast('Sample place removed. Replay the tour any time in Settings.');
  }, [inboxItems, places, persist]);

  // A sample left behind (the app was closed mid-tour and never reopened the tour) is removed once the tour is over.
  useEffect(() => {
    if (t || !saved || saved === 'missing' || !saved.done || loading) return;
    places.filter((p) => p.custom_info === TOUR_MARK && !removing.current.has(p.id)).forEach((p) => {
      removing.current.add(p.id);
      actionsRef.current.deletePlace(p.collection_id, p.id);
    });
  }, [t, saved, loading, places]);

  useEffect(() => {
    if (!t) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 300);
    return () => clearInterval(id);
  }, [Boolean(t)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Things done once as a step starts (and what to remember about the screen at that moment).
  const lastEntered = useRef('');
  useEffect(() => {
    if (!t || !ctx) return;
    const key = `${t.variant}:${t.step}`;
    if (lastEntered.current === key) return;
    lastEntered.current = key;
    enter(t.step, ctx, actionsRef.current);
    if (t.step === 'paste') setT((s) => (s ? { ...s, startPlaceIds: places.map((p) => p.id) } : s));
    if (t.step === 'coll') setT((s) => (s ? { ...s, startCollections: collections.length, placeCollectionAtStart: place?.collection_id ?? null } : s));
  }, [t, ctx, places, collections.length, place]);
  useEffect(() => { if (!t) lastEntered.current = ''; }, [t]);

  useEffect(() => { if (t && ctx) keepTrue(t.step, ctx, actionsRef.current); }, [t, ctx]);

  // A step that finished itself moves on after a moment, so the person sees it work.
  // (The latest `next` is read when the timer fires, so the page re-checks above never restart the wait.)
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    if (!desc?.done) return undefined;
    const id = setTimeout(() => nextRef.current(), 800);
    return () => clearTimeout(id);
  }, [desc?.done, t?.step]);
  useEffect(() => { if (desc?.fallbackTo) goTo(desc.fallbackTo, true); }, [desc?.fallbackTo, goTo]);

  if (!t || !ctx || !desc) return null;
  const dotSteps = list.filter(hasDot);
  return (
    <Overlay
      stepId={t.step}
      desc={desc}
      dot={dotSteps.indexOf(t.step) + 1}
      dotCount={dotSteps.length}
      canBack={t.history.length > 0 && t.step !== 'welcome'}
      onBack={() => goTo(t.history[t.history.length - 1], true)}
      onNext={next}
      onSkipTour={() => end(true)}
      onSkipStep={next}
      onExtra={(action) => {
        if (action === 'sample') actionsRef.current.addSampleReel();
        if (action === 'allow-push') {
          enableFridayPick(userId).then(() => actionsRef.current.showToast('Notifications are on for this phone.')).catch((e) => actionsRef.current.showToast(e.message));
        }
      }}
      onFinish={() => end(false)}
    />
  );
}
