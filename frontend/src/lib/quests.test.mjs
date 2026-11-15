import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTS, QUESTS_LAUNCH, detectQuests, isLegacyAccount, planQuestGrants, questById, questProgress, questXp } from './quests.js';
import { LEVEL_XP, badgeXp, levelInfo, totalXp } from './levels.js';

const ME = 'me';
const none = { userId: ME, profile: {}, places: [], collections: [], standalone: false, pushSubscribed: false, shortcutConnected: false, notes: {} };
const place = (extra = {}) => ({ id: 'p1', collection_id: 'c1', added_by: ME, reactions: {}, booking: null, ...extra });
const solo = { id: 'c1', members: [{ id: ME }] };
const pair = { id: 'c1', members: [{ id: ME }, { id: 'you' }] };
const done = (ctx) => detectQuests(ctx).sort();

test('there are nine starter quests, each explained, worth 95 XP in all', () => {
  assert.equal(QUESTS.length, 9);
  assert.equal(new Set(QUESTS.map((q) => q.id)).size, 9);
  for (const q of QUESTS) {
    assert.ok(q.title && q.why && q.how, `${q.id} needs a title, a why and a how`);
    assert.ok(Number.isInteger(q.xp) && q.xp > 0, `${q.id} needs XP`);
  }
  assert.equal(QUESTS.reduce((sum, q) => sum + q.xp, 0), 95);
});

test('every quest has clear steps: short, in order, each a sentence', () => {
  for (const q of QUESTS) {
    assert.ok(Array.isArray(q.steps) && q.steps.length >= 2 && q.steps.length <= 5, `${q.id} needs 2 to 5 steps`);
    for (const step of q.steps) assert.ok(typeof step === 'string' && step.length > 3 && step.length < 70 && /[.]$/.test(step), `${q.id}: "${step}" should be one short sentence`);
  }
});

test('nothing is done on a brand-new account', () => {
  assert.deepEqual(done(none), []);
});

test('Make it yours: the name quest is only ever marked by the person confirming their name, never detected', () => {
  assert.equal(questById('name').detect, undefined);
  assert.deepEqual(done({ ...none, profile: { display_name: 'Sam' } }), []);
});

test('Customise your profile: a frame, a title, a new avatar or a photo counts; the defaults do not', () => {
  assert.deepEqual(done({ ...none, profile: { avatar: '🙂', frame: null, title: null } }), []);
  assert.deepEqual(done({ ...none, profile: { avatar: '🙂', title: 'Wanderer' } }), []);
  for (const profile of [{ frame: 'bronze' }, { title: 'Explorer' }, { avatar: '🦊' }, { avatar: '🙂', avatar_url: 'https://x/y.png' }]) {
    assert.deepEqual(done({ ...none, profile }), ['customise'], JSON.stringify(profile));
  }
});

test('Save your first reel: one saved place is enough', () => {
  assert.deepEqual(done({ ...none, places: [place()], collections: [solo] }), ['save']);
});

test('Add to Home Screen: only when the app is running installed', () => {
  assert.deepEqual(done({ ...none, standalone: true }), ['homescreen']);
});

test('Turn on notifications: needs a real push subscription', () => {
  assert.deepEqual(done({ ...none, pushSubscribed: true }), ['notifications']);
});

test('Set up the share shortcut: needs the shortcut to have connected', () => {
  assert.deepEqual(done({ ...none, shortcutConnected: true }), ['shortcut']);
});

test('Invite your partner: someone has to have joined, sending alone does not count', () => {
  assert.deepEqual(done({ ...none, collections: [solo] }), []);
  assert.deepEqual(done({ ...none, collections: [pair] }), ['invite']);
});

test('Vote on a place: my vote, not someone else\'s', () => {
  assert.deepEqual(done({ ...none, places: [place({ reactions: { you: 'keen' } })], collections: [solo] }), ['save']);
  assert.deepEqual(done({ ...none, places: [place({ reactions: { [ME]: 'keen' } })], collections: [solo] }), ['save', 'vote']);
});

test('Book a time: a planned time counts, my own or one with no owner recorded', () => {
  assert.deepEqual(done({ ...none, places: [place({ booking: { planned_at: '2026-12-01T10:00:00Z', booked_by: ME } })], collections: [solo] }), ['book', 'save']);
  assert.deepEqual(done({ ...none, places: [place({ booking: { planned_at: '2026-12-01T10:00:00Z' } })], collections: [solo] }), ['book', 'save']);
  assert.deepEqual(done({ ...none, places: [place({ booking: { done_at: '2026-12-01T10:00:00Z' } })], collections: [solo] }), ['save']);
});

test('a quest already noted is never detected again', () => {
  const ctx = { ...none, places: [place()], collections: [solo], notes: { save: '2026-11-16T01:00:00Z' } };
  assert.deepEqual(done(ctx), []);
});

test('XP comes from the notes, once each, and ignores anything it does not know', () => {
  assert.equal(questXp({}), 0);
  assert.equal(questXp({ save: 'x' }), 15);
  assert.equal(questXp({ save: 'x', vote: 'x', ghost: 'x', book: '' }), 20);
  assert.equal(questXp(Object.fromEntries(QUESTS.map((q) => [q.id, 'x']))), 95);
  assert.equal(questXp(null), 0);
});

test('a quest stays earned after the thing is undone (deleting the reel does not take the XP back)', () => {
  const notes = { save: '2026-11-16T01:00:00Z' };
  assert.equal(questXp(notes), 15);
  assert.deepEqual(done({ ...none, places: [], notes }), []);
});

test('planning grants: new ones are noted with the time, and a second pass grants nothing', () => {
  const now = '2026-11-16T02:00:00Z';
  const ctx = { ...none, places: [place()], collections: [solo], standalone: true };
  const first = planQuestGrants(ctx, { now });
  assert.deepEqual(first.granted.sort(), ['homescreen', 'save']);
  assert.deepEqual(first.notes, { save: now, homescreen: now });
  assert.equal(first.xp, 30);
  const second = planQuestGrants({ ...ctx, notes: first.notes }, { now: '2026-11-16T03:00:00Z' });
  assert.deepEqual(second.granted, []);
  assert.deepEqual(second.notes, first.notes);
});

test('marking a quest by hand (the name) works once and only for known quests', () => {
  const now = '2026-11-16T02:00:00Z';
  const first = planQuestGrants(none, { now, mark: 'name' });
  assert.deepEqual(first.granted, ['name']);
  assert.equal(first.xp, 5);
  assert.deepEqual(planQuestGrants({ ...none, notes: first.notes }, { now, mark: 'name' }).granted, []);
  assert.deepEqual(planQuestGrants(none, { now, mark: 'nonsense' }).granted, []);
});

test('accounts made before the launch are credited quietly, new ones get a pop for each', () => {
  assert.equal(isLegacyAccount('2026-11-01T00:00:00Z'), true);
  assert.equal(isLegacyAccount(QUESTS_LAUNCH), false);
  assert.equal(isLegacyAccount('2026-12-01T00:00:00Z'), false);
  assert.equal(isLegacyAccount(undefined), false);
  const ctx = { ...none, places: [place()], collections: [solo] };
  assert.equal(planQuestGrants(ctx, { now: 'x', legacy: true }).announce.length, 0);
  assert.deepEqual(planQuestGrants(ctx, { now: 'x', legacy: false }).announce.map((q) => q.id), ['save']);
});

test('progress for the card: how many are done, the XP earned, and which come next', () => {
  const p = questProgress({ save: 'x', homescreen: 'x' });
  assert.equal(p.done, 2);
  assert.equal(p.total, 9);
  assert.equal(p.xp, 30);
  assert.equal(p.totalXp, 95);
  assert.equal(p.complete, false);
  assert.deepEqual(p.next.slice(0, 2).map((q) => q.id), ['name', 'customise']);
  assert.equal(questProgress(Object.fromEntries(QUESTS.map((q) => [q.id, 'x']))).complete, true);
  assert.equal(p.list.length, 9);
  assert.deepEqual(p.list.filter((q) => q.done).map((q) => q.id), ['save', 'homescreen']);
});

test('Test Driver is worth 20 XP and every other badge 100', () => {
  assert.equal(badgeXp('demo'), 20);
  assert.equal(badgeXp('explorer'), 100);
  assert.equal(badgeXp(undefined), 100);
});

test('a new account starts on Level 1 with 0 XP, and Test Driver alone keeps it on Level 1', () => {
  assert.equal(totalXp({ places: [], collections: [], userId: ME }, [], 0, 0), 0);
  assert.equal(levelInfo(0).level, 1);
  const withTestDriver = totalXp({ places: [], collections: [], userId: ME }, ['demo'], 0, 0);
  assert.equal(withTestDriver, 20);
  assert.equal(levelInfo(withTestDriver).level, 1);
});

test('pacing: the first session reaches Level 2, finishing every quest with Test Driver reaches Level 3 but not Level 4', () => {
  const input = { places: [place()], collections: [solo], userId: ME }; // one saved place also earns the normal 5 XP for a save
  const firstSession = ['name', 'customise', 'save'];
  const xpFirst = totalXp(input, ['demo'], 0, questXp(Object.fromEntries(firstSession.map((id) => [id, 'x']))));
  assert.equal(xpFirst, 5 + 20 + 5 + 10 + 15); // save 5, Test Driver 20, then the three quests
  assert.equal(levelInfo(xpFirst).level, 2);
  const all = totalXp(input, ['demo'], 0, questXp(Object.fromEntries(QUESTS.map((q) => [q.id, 'x']))));
  assert.equal(all, 5 + 20 + 95);
  assert.equal(levelInfo(all).level, 3);
  assert.ok(all < LEVEL_XP[3], 'still short of Level 4');
});

test('the old way of counting claimed badges (a number) still works', () => {
  assert.equal(totalXp({ places: [], collections: [], userId: ME }, 2, 3), 200 + 150);
  assert.equal(totalXp({ places: [], collections: [], userId: ME }, ['explorer', 'curator'], 3), 200 + 150);
});
