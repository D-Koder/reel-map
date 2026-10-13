// The "Up next" card on Home picks one thing, in priority order:
// 1. soonest booking still to come, 2. soonest unbooked event within 3 months,
// 3. food/cafe I'm keen on (most keen votes first), 4. a food/cafe I said maybe to.
import { describe, expect, it } from 'vitest';
import { pickUpNext } from '../../src/components/HomeScreen.jsx';

const ME = 'me';
const NOW = new Date('2026-10-13T12:00:00');

const place = (id, patch = {}) => ({ id, name: id, collection_id: 'c1', category: 'food', reactions: {}, ...patch });
const booked = (id, plannedAt, patch) => place(id, { booking: { planned_at: plannedAt }, ...patch });
const event = (id, day, patch) => place(id, { category: 'event', event_date: day, ...patch });

describe('pickUpNext priority', () => {
  it('nothing saved → no card', () => {
    expect(pickUpNext([], ME, NOW)).toBeNull();
  });

  it('1. a booking beats everything, soonest first', () => {
    const pick = pickUpNext([
      event('gig', '2026-10-14'),
      place('keen', { reactions: { [ME]: 'keen' } }),
      booked('later', '2026-10-20T19:00:00'),
      booked('sooner', '2026-10-15T19:00:00'),
    ], ME, NOW);
    expect(pick).toMatchObject({ kind: 'booked', place: { id: 'sooner' } });
  });

  it('a booking earlier today still counts; one from yesterday does not', () => {
    expect(pickUpNext([booked('today', '2026-10-13T08:00:00')], ME, NOW)?.kind).toBe('booked');
    expect(pickUpNext([booked('yesterday', '2026-10-12T19:00:00')], ME, NOW)).toBeNull();
  });

  it('a booking marked done is skipped', () => {
    const done = booked('done', '2026-10-15T19:00:00', { booking: { planned_at: '2026-10-15T19:00:00', done_at: '2026-10-15T22:00:00' } });
    expect(pickUpNext([done], ME, NOW)).toBeNull();
  });

  it('2. with no booking, the soonest event in the next 3 months', () => {
    const pick = pickUpNext([
      place('keen', { reactions: { [ME]: 'keen' } }),
      event('far', '2026-12-01'),
      event('near', '2026-10-20'),
    ], ME, NOW);
    expect(pick).toMatchObject({ kind: 'event', place: { id: 'near' } });
    expect(pick.date).toEqual(new Date('2026-10-20T00:00:00'));
  });

  it('events today count, past events and ones over 3 months away do not', () => {
    expect(pickUpNext([event('today', '2026-10-13')], ME, NOW)?.place.id).toBe('today');
    expect(pickUpNext([event('past', '2026-10-01'), event('far', '2027-02-01')], ME, NOW)).toBeNull();
  });

  it('3. then food/cafe I am keen on, the one with the most keen votes first', () => {
    const pick = pickUpNext([
      place('maybe', { reactions: { [ME]: 'maybe' } }),
      place('one-keen', { reactions: { [ME]: 'keen' } }),
      place('three-keen', { category: 'cafe', reactions: { [ME]: 'keen', a: 'keen', b: 'keen' } }),
    ], ME, NOW);
    expect(pick).toMatchObject({ kind: 'keen', place: { id: 'three-keen' } });
  });

  it('places only someone else is keen on are not picked', () => {
    expect(pickUpNext([place('theirs', { reactions: { other: 'keen' } })], ME, NOW)).toBeNull();
  });

  it('4. last, a maybe — the same one all day', () => {
    const maybes = ['a', 'b', 'c'].map((id) => place(id, { reactions: { [ME]: 'maybe' } }));
    const morning = pickUpNext(maybes, ME, new Date('2026-10-13T08:00:00'));
    const night = pickUpNext(maybes, ME, new Date('2026-10-13T22:00:00'));
    expect(morning.kind).toBe('maybe');
    expect(night.place.id).toBe(morning.place.id);
  });

  it('"meh" places are never picked', () => {
    expect(pickUpNext([place('meh', { reactions: { [ME]: 'meh' } })], ME, NOW)).toBeNull();
  });

  it('the card links to the right place entry (collection:id)', () => {
    const pick = pickUpNext([booked('x', '2026-10-15T19:00:00', { collection_id: 'date-night' })], ME, NOW);
    expect(`${pick.place.collection_id}:${pick.place.id}`).toBe('date-night:x');
  });
});
