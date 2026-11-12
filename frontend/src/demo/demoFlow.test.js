import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANS, canGoBack, demoReducer, describeDemo, doneSummary, handoffFrom, initialState, suggestedTimes, tipMs } from './demoFlow.js';
import { clearDemoHandoff, hasAccountHere, readDemoHandoff, rememberAccountHere, saveDemoHandoff } from '../lib/demoHandoff.js';

const run = (actions, s = initialState()) => actions.reduce((state, a) => demoReducer(state, typeof a === 'string' ? { type: a } : a), s);
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('the demo runs from welcome to done, booking a time on the way', () => {
  const t = suggestedTimes(new Date(2026, 10, 11, 12, 0))[0].iso; // a Wednesday
  const s = run(['start', { type: 'plan', name: 'Date night', emoji: '🍷' }, 'paste', 'found', 'save', 'saved-done', 'open', { type: 'booked', iso: t }, 'booked-next']);
  assert.equal(s.step, 'done');
  assert.equal(s.collName, 'Date night');
  assert.equal(s.booked, t);
  assert.equal(s.saved, true);
});

test('tips point at the right thing at each moment', () => {
  let s = run(['start', { type: 'plan', name: 'Food crawl', emoji: '🍜' }]);
  assert.equal(describeDemo(s).target, '[data-tour="paste"]');
  s = run(['paste'], s);
  assert.equal(describeDemo(s).target, '.inbox-card');
  assert.equal(describeDemo(s).auto.action, 'found');
  s = run(['found'], s);
  assert.equal(describeDemo(s).title, 'Is this the spot?');
  assert.equal(describeDemo(s).target, '[data-tour="confirm"]');
  s = run(['save'], s);
  assert.equal(describeDemo(s).title, 'Saved! 🎉');
  assert.equal(describeDemo(s).auto.action, 'saved-done');
  s = run(['saved-done'], s);
  assert.equal(describeDemo(s).target, '[data-tour="place"]');
  s = run(['open'], s);
  assert.equal(describeDemo(s, { wizard: 'time' }).target, '[data-tour="plan"]');
  assert.equal(describeDemo(s, { wizard: 'time', timePicked: true }).target, '.time-picker .step-btn.primary');
  assert.equal(describeDemo(s, { wizard: 'confirm' }).target, '.checklist-step .step-btn.primary');
  assert.match(describeDemo(s, { wizard: 'confirm' }).body, /time you booked/);
  assert.match(describeDemo(s, { wizard: 'time' }).body, /Call or Website/);
  assert.equal(describeDemo(run([{ type: 'booked', iso: 'x' }], s)).target, '.checklist-step');
});

test('Save only works once the place is found, and Verify place explains itself instead of leaving', () => {
  let s = run(['start', { type: 'plan', name: 'x', emoji: 'y' }, 'paste']);
  assert.equal(demoReducer(s, { type: 'save' }).saved, false);
  s = run(['found', 'verify'], s);
  assert.equal(s.paste, 'confirm');
  assert.match(describeDemo(s).title, /Verify place/);
  assert.equal(run(['save'], s).saved, true);
});

test('Back closes the place sheet until it is booked', () => {
  let s = run(['start', { type: 'plan', name: 'x', emoji: 'y' }, 'paste', 'found', 'save', 'saved-done', 'open']);
  assert.equal(canGoBack(s), true);
  s = run(['back'], s);
  assert.equal(s.placeOpen, false);
  assert.equal(canGoBack(s), false);
});

test('skipping goes to the end card and says only what was done', () => {
  const s = run(['start', 'ask-skip', 'skip']);
  assert.equal(s.step, 'done');
  assert.equal(doneSummary(s).title, 'Ready when you are');
  assert.ok(!/booked|saved/.test(doneSummary(s).body));
});

test('the end card lists exactly what happened, with no time claims', () => {
  const saved = run(['start', { type: 'plan', name: 'x', emoji: 'y' }, 'paste', 'found', 'save', 'skip']);
  assert.equal(doneSummary(saved).body, 'You saved a reel. Save your own reels and plan with a partner.');
  const booked = { ...saved, booked: '2026-11-13T19:00:00.000Z' };
  assert.equal(doneSummary(booked).body, 'You saved a reel and booked a time faster than I could say Waylit Maps. Make it yours and plan with a partner.');
  for (const s of [saved, booked, initialState()]) assert.doesNotMatch(JSON.stringify(describeDemo(s)), /minute|second/i);
});

test('suggested times are three, in order, and in the future', () => {
  const now = new Date(2026, 10, 11, 12, 0);
  const times = suggestedTimes(now);
  assert.equal(times.length, 3);
  const dates = times.map((x) => new Date(x.iso));
  assert.ok(dates.every((d) => d > now));
  assert.deepEqual([...dates].sort((a, b) => a - b), dates);
  assert.deepEqual(dates.map((d) => d.getDay()), [5, 6, 6]);
  // On a Friday evening after 7pm, that Friday has passed, so the next one is a week away.
  const late = suggestedTimes(new Date(2026, 10, 13, 21, 0));
  assert.ok(late.every((x) => new Date(x.iso) > new Date(2026, 10, 13, 21, 0)));
});

test('tips stay up at least a second and a half, and not forever', () => {
  assert.ok(tipMs('a', 'b') >= 1500);
  assert.ok(tipMs('x'.repeat(200), 'y'.repeat(200)) <= 3000);
});

test('the four plans are the ones in the design', () => {
  assert.deepEqual(PLANS.map((p) => p.name), ['Date night', 'Weekend away', 'Food crawl', 'Friends hangout']);
});

test('the hand-off keeps the collection and what was done, and nothing else', () => {
  const store = memory();
  const s = { ...run(['start', { type: 'plan', name: 'Date night', emoji: '🍷' }, 'paste', 'found', 'save']), booked: 'x' };
  assert.equal(saveDemoHandoff(handoffFrom(s), store, 1000), true);
  assert.deepEqual(readDemoHandoff(store, 2000), { v: 1, collName: 'Date night', collEmoji: '🍷', did: { saved: true, booked: true }, at: 1000 });
  clearDemoHandoff(store);
  assert.equal(readDemoHandoff(store, 2000), null);
});

test('the hand-off is ignored after a week, when broken, or with no collection', () => {
  const store = memory();
  saveDemoHandoff({ collName: 'Date night', collEmoji: '🍷' }, store, 0);
  assert.equal(readDemoHandoff(store, 8 * 24 * 60 * 60 * 1000), null);
  store.setItem('waylit:demo', '{not json');
  assert.equal(readDemoHandoff(store), null);
  assert.equal(saveDemoHandoff({ collName: '' }, store), false);
});

test('a storage that throws never breaks the demo', () => {
  const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } };
  assert.equal(saveDemoHandoff({ collName: 'x' }, broken), false);
  assert.equal(readDemoHandoff(broken), null);
  assert.doesNotThrow(() => clearDemoHandoff(broken));
  assert.equal(hasAccountHere(broken), false);
  assert.doesNotThrow(() => rememberAccountHere(broken));
});

test('a device that has signed in before is remembered', () => {
  const store = memory();
  assert.equal(hasAccountHere(store), false);
  rememberAccountHere(store);
  assert.equal(hasAccountHere(store), true);
});
