// Alerts: nearby alerts (keen places within 200 m) and where tapping a notification goes.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COOLDOWN_MS, NEAR_METRES, distanceMetres, keenPlacesNear } from '../../src/hooks/useNearbyAlerts.js';
import { notificationTarget } from '../../src/lib/notificationTarget.js';

const ME = 'me';
// Flinders Street Station, as [lng, lat].
const HERE = [144.9671, -37.8183];
// About 100 m and 500 m north.
const near = { lat: -37.8174, lng: 144.9671 };
const far = { lat: -37.8138, lng: 144.9671 };

const keen = (id, spot, patch = {}) => ({ id, ...spot, reactions: { [ME]: 'keen' }, ...patch });

describe('nearby alerts: which places count', () => {
  it('distance is right to within a few metres', () => {
    expect(distanceMetres(HERE, [near.lng, near.lat])).toBeGreaterThan(95);
    expect(distanceMetres(HERE, [near.lng, near.lat])).toBeLessThan(105);
  });

  it(`only keen places within ${NEAR_METRES} m, nearest first`, () => {
    const result = keenPlacesNear([keen('far', far), keen('near', near), keen('closest', { lat: -37.8182, lng: 144.9671 })], ME, HERE);
    expect(result.map((r) => r.place.id)).toEqual(['closest', 'near']);
  });

  it('maybe / meh / other people’s keen do not alert', () => {
    const result = keenPlacesNear([
      { id: 'maybe', ...near, reactions: { [ME]: 'maybe' } },
      { id: 'meh', ...near, reactions: { [ME]: 'meh' } },
      { id: 'theirs', ...near, reactions: { other: 'keen' } },
    ], ME, HERE);
    expect(result).toEqual([]);
  });

  it('places already done do not alert, booked-but-not-done still do', () => {
    const result = keenPlacesNear([
      keen('done', near, { booking: { done_at: '2026-10-01' } }),
      keen('booked', near, { booking: { planned_at: '2026-10-20' } }),
    ], ME, HERE);
    expect(result.map((r) => r.place.id)).toEqual(['booked']);
  });

  it('a place in two collections alerts once', () => {
    const result = keenPlacesNear([keen('x', near, { collection_id: 'a' }), keen('x', near, { collection_id: 'b' })], ME, HERE);
    expect(result).toHaveLength(1);
  });

  it('places with no pin are ignored', () => {
    expect(keenPlacesNear([keen('nopin', { lat: null, lng: null })], ME, HERE)).toEqual([]);
  });

  it('cooldown is 15 minutes', () => {
    expect(COOLDOWN_MS).toBe(15 * 60 * 1000);
  });
});

describe('nearby alerts: the hook (once per place per day, 15 min cooldown)', () => {
  let watcher;
  let useNearbyAlerts;

  beforeEach(async () => {
    vi.resetModules();
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    });
    vi.stubGlobal('navigator', {
      geolocation: { watchPosition: (fn) => { watcher = fn; return 1; }, clearWatch: () => {} },
    });
    // Run effects straight away, without rendering React.
    vi.doMock('react', () => ({ useRef: (v) => ({ current: v }), useEffect: (fn) => fn() }));
    ({ useNearbyAlerts } = await import('../../src/hooks/useNearbyAlerts.js'));
  });

  const at = ([lng, lat]) => ({ coords: { longitude: lng, latitude: lat } });

  it('alerts once, then stays quiet for 15 minutes, then can alert a different place', () => {
    vi.useFakeTimers({ now: new Date('2026-10-13T12:00:00') });
    const onNear = vi.fn();
    const places = [keen('a', near), keen('b', { lat: -37.8170, lng: 144.9672 })];
    useNearbyAlerts({ userId: ME, places, enabled: true, onNear });

    watcher(at(HERE));
    expect(onNear).toHaveBeenCalledTimes(1);
    expect(onNear.mock.calls[0][0].id).toBe('a');

    vi.advanceTimersByTime(5 * 60 * 1000);
    watcher(at(HERE));
    expect(onNear).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(COOLDOWN_MS);
    watcher(at(HERE));
    expect(onNear).toHaveBeenCalledTimes(2);
    expect(onNear.mock.calls[1][0].id).toBe('b');

    // Both alerted today: nothing more, however long you stay.
    vi.advanceTimersByTime(COOLDOWN_MS * 2);
    watcher(at(HERE));
    expect(onNear).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does nothing when turned off', () => {
    watcher = null;
    useNearbyAlerts({ userId: ME, places: [keen('a', near)], enabled: false, onNear: vi.fn() });
    expect(watcher).toBeNull();
  });
});

describe('tapping a notification opens the right thing', () => {
  const collections = [{ id: 'c1', name: 'Date night' }, { id: 'c2', name: 'Date night out' }];
  const places = [
    { id: 'p1', name: 'Pho Bar', collection_id: 'c1' },
    { id: 'p2', name: 'Pho Bar Richmond', collection_id: 'c1' },
    { id: 'p1', name: 'Pho Bar', collection_id: 'c2' },
  ];

  // Every notification type the app shows, with the ids the database sends.
  it.each([
    ['place_added', { place: { id: 'p1', collection_id: 'c2' } }],
    ['place_reacted', { place: { id: 'p1', collection_id: 'c2' } }],
    ['place_booked', { place: { id: 'p1', collection_id: 'c2' } }],
    ['place_done', { place: { id: 'p1', collection_id: 'c2' } }],
    ['place_removed', { collection: { id: 'c2' } }],
  ])('%s with ids', (type, expected) => {
    const target = notificationTarget({ type, placeId: 'p1', collectionId: 'c2', message: '' }, places, collections);
    expect(target).toMatchObject(expected);
  });

  it.each(['collection_joined', 'collection_left', 'collection_private'])('%s opens the collection', (type) => {
    expect(notificationTarget({ type, collectionId: 'c1', message: '' }, places, collections)).toMatchObject({ collection: { id: 'c1' } });
  });

  it('with no ids, finds the longest place and collection named in the message', () => {
    const target = notificationTarget({ type: 'place_added', message: 'Sam added "Pho Bar Richmond" to Date night' }, places, collections);
    expect(target.place.id).toBe('p2');
  });

  it('a removed place never opens the place itself', () => {
    const target = notificationTarget({ type: 'place_removed', message: 'Sam removed "Pho Bar" from Date night out' }, places, collections);
    expect(target).toEqual({ collection: collections[1] });
  });

  it('nothing matches → null', () => {
    expect(notificationTarget({ type: 'place_added', message: 'something else' }, places, collections)).toBeNull();
    expect(notificationTarget(null, places, collections)).toBeNull();
  });
});
