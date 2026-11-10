import test from 'node:test';
import assert from 'node:assert/strict';
import { describe, stepsFor, hasDot, needsPlace, TOUR_MARK } from './steps.js';

const base = {
  variant: 'main', name: 'Alex', isWide: false, isIos: false, standalone: false, userId: 'u1',
  place: null, placeKey: null, collections: [{ id: 'c1' }], startCollections: 1, placeCollectionAtStart: null,
  openPinId: null, editPinId: null, settingsOpen: false, shareOpen: false, notificationsOpen: false, screen: 'home',
  inboxItems: [], inviteSent: false, hasVotablePlace: false, votablePlace: null, has: () => false,
};
const place = { id: 'p1', collection_id: 'c1', booking: null, reactions: {} };
const withPlace = (extra = {}) => ({ ...base, place, placeKey: 'c1:p1', ...extra });

test('the main tour has 11 steps on a phone and leaves out Map on wide screens', () => {
  assert.equal(stepsFor('main', base).length, 11);
  assert.ok(stepsFor('main', base).includes('map'));
  assert.ok(!stepsFor('main', { ...base, isWide: true }).includes('map'));
});

test('the install tip only shows on an iPhone that has not added the app yet', () => {
  assert.ok(!stepsFor('main', base).includes('install'));
  assert.ok(stepsFor('main', { ...base, isIos: true }).includes('install'));
  assert.ok(!stepsFor('main', { ...base, isIos: true, standalone: true }).includes('install'));
});

test('stays under 14 steps with everything switched on', () => {
  assert.ok(stepsFor('main', { ...base, isIos: true }).length < 14);
});

test('the partner tour is short and skips voting when there is nothing to vote on', () => {
  assert.deepEqual(stepsFor('partner', base), ['welcome', 'notes', 'notify', 'done']);
  assert.ok(stepsFor('partner', { ...base, hasVotablePlace: true }).includes('vote'));
});

test('every step has a title and body, and anchors are CSS selectors or empty', () => {
  const all = [...stepsFor('main', { ...base, isIos: true }), 'vote'];
  for (const id of all) {
    const d = describe(id, { ...withPlace(), votablePlace: place });
    assert.ok(d.title && d.body, `${id} needs a title and body`);
    if (d.anchor) assert.match(d.anchor, /^\[data-tour=/);
  }
});

test('paste offers a sample place until something is saved or on its way', () => {
  assert.equal(describe('paste', base).extra.action, 'sample');
  assert.equal(describe('paste', base).extra.label, 'Try a sample place');
  assert.equal(describe('paste', { ...base, inboxItems: [{}] }).extra, null);
  assert.equal(describe('paste', { ...base, inboxItems: [{}] }).done, true);
});

test('confirm points at the card when there is one, and falls back to paste if it is removed', () => {
  assert.equal(describe('confirm', { ...base, has: () => true }).anchor, '[data-tour="confirm"]');
  assert.equal(describe('confirm', { ...base, inboxItems: [] }).fallbackTo, 'paste');
  assert.equal(describe('confirm', { ...base, inboxItems: [{}] }).fallbackTo, null);
  assert.equal(describe('confirm', withPlace()).done, true);
});

test('book goes: tap the place, then the plan steps, then done once booked', () => {
  assert.match(describe('book', withPlace()).anchor, /data-tour-for="c1:p1"/);
  assert.equal(describe('book', withPlace({ openPinId: 'c1:p1' })).anchor, '[data-tour="plan"]');
  assert.equal(describe('book', withPlace({ openPinId: 'p1' })).anchor, '[data-tour="plan"]'); // opened by its id alone
  const booked = describe('book', withPlace({ place: { ...place, booking: { planned_at: 'x' } } }));
  assert.equal(booked.needsNext, true);
  assert.equal(booked.anchor, undefined);
});

test('moving a place: gear, new collection, open place, pencil, copy or move, move form, done', () => {
  const at = (extra) => describe('coll', withPlace({ placeCollectionAtStart: 'c1', ...extra }));
  assert.equal(at({}).anchor, '[data-tour="gear"]');
  assert.equal(at({ settingsOpen: true }).anchor, '[data-tour="new-collection"]');
  const created = { collections: [{ id: 'c1' }, { id: 'c2' }] };
  assert.match(at(created).anchor, /data-tour-for="c1:p1"/);
  assert.equal(at({ ...created, openPinId: 'c1:p1' }).anchor, '[data-tour="edit"]');
  assert.equal(at({ ...created, editPinId: 'c1:p1' }).anchor, '[data-tour="move-open"]');
  assert.equal(at({ ...created, editPinId: 'c1:p1', has: (s) => s === '[data-tour="move-form"]' }).anchor, '[data-tour="move-form"]');
  const moved = at({ ...created, place: { ...place, collection_id: 'c2' } });
  assert.equal(moved.done, true);
});

test('the move steps tell the person only the one who saved a place can move it', () => {
  const created = { collections: [{ id: 'c1' }, { id: 'c2' }], placeCollectionAtStart: 'c1' };
  for (const extra of [{}, { openPinId: 'p1' }, { editPinId: 'p1' }]) {
    assert.match(describe('coll', withPlace({ ...created, ...extra })).body, /Only the person who saved a place can move it/);
  }
});

test('share points at the settings button, then the collection button, then Send invite', () => {
  assert.equal(describe('share', withPlace()).anchor, '[data-tour="gear"]');
  assert.equal(describe('share', withPlace({ settingsOpen: true })).anchor, '[data-tour="share"][data-tour-for="c1"]');
  const open = describe('share', withPlace({ shareOpen: true }));
  assert.equal(open.anchor, '[data-tour="invite"]');
  assert.equal(describe('share', withPlace({ shareOpen: true, inviteSent: true })).done, true);
  assert.equal(open.skipLabel, 'Do this later');
});

test('steps that point at the place are passed over when there is no place', () => {
  assert.deepEqual(['paste', 'confirm', 'keen', 'book', 'map', 'coll', 'share'].filter(needsPlace), ['keen', 'book', 'coll']);
});

test('share still works with no place, using the first collection', () => {
  assert.equal(describe('share', { ...base, settingsOpen: true, shareCollectionId: 'c9' }).anchor, '[data-tour="share"][data-tour-for="c9"]');
});

test('only the dotted steps count toward progress', () => {
  assert.equal(hasDot('welcome'), false);
  assert.equal(hasDot('install'), false);
  assert.equal(hasDot('done'), false);
  assert.equal(hasDot('paste'), true);
});

test('the sample marker is a plain sentence a person can read on the place', () => {
  assert.match(TOUR_MARK, /^Sample for the tour/);
});

// Guards against a button being renamed or removed in the app while the tour still points at it.
test('every spot the tour points at exists in the app code', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const root = path.resolve(import.meta.dirname, '..');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'tour' ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]));
  const source = walk(root).filter((f) => /\.(jsx|js)$/.test(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const stepsSource = fs.readFileSync(path.join(import.meta.dirname, 'steps.js'), 'utf8');
  const names = [...new Set([...stepsSource.matchAll(/data-tour=\\?"([a-z-]+)\\?"/g)].map((m) => m[1]))];
  assert.ok(names.length >= 12, `expected the tour to use many anchors, found ${names.length}`);
  for (const name of names) {
    const used = new RegExp(`data-tour=(?:"${name}"|\\{[^}]*'${name}'[^}]*\\})`).test(source);
    assert.ok(used, `the app has nothing marked data-tour="${name}"`);
  }
});

test('the welcome greets the person by name without a stray comma', () => {
  assert.equal(describe('welcome', base).title, 'Hey Alex, welcome to Waylit!');
  assert.equal(describe('welcome', { ...base, name: '' }).title, 'Hey, welcome to Waylit!');
  assert.equal(describe('welcome', { ...base, variant: 'partner' }).title, 'Welcome, Alex!');
});

test('share stays done after the Share window closes itself', () => {
  for (const extra of [{}, { settingsOpen: true }, { shareOpen: true }]) {
    assert.equal(describe('share', withPlace({ ...extra, inviteSent: true })).done, true);
    assert.ok(!describe('share', withPlace({ ...extra })).done);
  }
});

test('the example collection name is not a couples name', () => {
  const texts = ['coll'].flatMap((id) => [describe(id, withPlace({ placeCollectionAtStart: 'c1' })), describe(id, withPlace({ placeCollectionAtStart: 'c1', settingsOpen: true }))]).map((d) => `${d.title} ${d.body}`).join(' ');
  assert.match(texts, /Weekend eats/);
  assert.doesNotMatch(texts, /Date ideas/);
});

test('notifications are described as on by default, with no "switch it on" instruction', () => {
  for (const pushState of ['granted', 'default', 'denied', 'unsupported']) {
    const d = describe('notify', withPlace({ settingsOpen: true, pushState }));
    assert.doesNotMatch(`${d.title} ${d.body} ${d.hint ?? ''}`, /switch .* on|turn on notifications/i, pushState);
  }
  assert.equal(describe('notify', withPlace({ settingsOpen: true, pushState: 'granted' })).title, 'Your notifications are on');
  assert.equal(describe('notify', withPlace({ settingsOpen: true, pushState: 'default' })).extra.action, 'allow-push');
  assert.equal(describe('notify', withPlace({ settingsOpen: true, pushState: 'granted' })).extra, undefined);
});

test('the notifications step points at the newest notification, so the card never covers it', () => {
  assert.equal(describe('notes', withPlace({ notificationsOpen: true, has: (s) => s === '[data-tour="note-first"]' })).anchor, '[data-tour="note-first"]');
  assert.equal(describe('notes', withPlace({ notificationsOpen: true })).anchor, '[data-tour="notes"]');
});

test('the map step asks for every pin to show', async () => {
  const { enter } = await import('./steps.js');
  let asked = 0;
  enter('map', base, { showAllOnMap: () => { asked += 1; }, setScreen() {}, closePin() {}, closeEdit() {}, closeSettings() {}, closeShare() {}, closeNotifications() {} });
  assert.equal(asked, 1);
});

test('after Wrong place the tour asks for the right place instead of saying it is still looking', () => {
  const d = describe('confirm', { ...base, inboxItems: [{ status: 'needs-place' }] });
  assert.equal(d.title, 'Pick the right place');
  assert.equal(d.fallbackTo, undefined);
});
