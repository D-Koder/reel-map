// @vitest-environment jsdom
// The smaller pieces: an unreadable reel, the calendar file, the "right spot" Google Maps link,
// the service worker's push notifications, and the Friday pick sender.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendPicks } from '../../../supabase/functions/send-friday-pick/pick.ts';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('journey: a reel nobody can read → the person picks the place', () => {
  it('Instagram says no and Chrome fails → 200 with "pick the place yourself", nothing cached', async () => {
    const calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET' });
      if (String(url).includes('instagram.com/api/v1/oembed')) return new Response('', { status: 404 });
      return new Response('[]');
    }));
    const { enrich } = require('../../../api/enrich-reel.js');
    const res = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    // A Chrome that can't start.
    await enrich({ method: 'POST', body: { reelUrl: 'https://www.instagram.com/reel/GONE123/' } }, res, () => Promise.reject(new Error('no chrome')));

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, unreadable: true, maps: { success: false, candidates: [] } });
    expect(res.body.maps.error).toMatch(/pick the place yourself/);
    expect(calls.some((c) => c.method === 'POST'), 'an unreadable reel was cached').toBe(false);
  });
});

describe('Add to calendar (.ics file)', () => {
  it('makes a 2-hour event with the place, address and reel, and escapes commas', async () => {
    let blob;
    let download;
    URL.createObjectURL = (b) => { blob = b; return 'blob:x'; };
    URL.revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function record() { download = this.download; });
    const { addToCalendar } = await import('../../src/lib/calendar.js');

    addToCalendar({ title: 'Gimlet, date night', location: '33 Russell St, Melbourne', description: 'https://www.instagram.com/reel/A/', start: '2026-10-17T19:00:00Z' });
    // jsdom's Blob has no .text(), so read it the old way.
    const text = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(blob);
    });

    expect(download).toBe('reel-map-event.ics');
    expect(text).toContain('DTSTART:20261017T190000Z');
    expect(text).toContain('DTEND:20261017T210000Z');
    expect(text).toContain('SUMMARY:Gimlet\\, date night');
    expect(text).toContain('LOCATION:33 Russell St\\, Melbourne');
    expect(text.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
    click.mockRestore();
    delete URL.createObjectURL;
    delete URL.revokeObjectURL;
  });
});

describe('Google Maps link goes to the right spot', () => {
  const place = { name: 'Gimlet', address: '33 Russell St, Melbourne', lat: -37.8155, lng: 144.9714 };
  const geocodeAt = (lat, lng) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ features: [{ center: [lng, lat] }] }))));
  const load = async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'test-token');
    return import('../../src/lib/places.js');
  };

  it('address within 300 m of the pin → search by name and address', async () => {
    geocodeAt(-37.8157, 144.9716);
    const { checkedGoogleMapsLink } = await load();
    expect(await checkedGoogleMapsLink(place)).toContain(encodeURIComponent('Gimlet, 33 Russell St'));
  });

  it('address somewhere else → the saved pin instead', async () => {
    geocodeAt(-33.8688, 151.2093);
    const { checkedGoogleMapsLink } = await load();
    expect(await checkedGoogleMapsLink(place)).toBe('https://www.google.com/maps/search/?api=1&query=-37.8155,144.9714');
  });

  it('lookup fails → still the name and address search', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { checkedGoogleMapsLink } = await load();
    expect(await checkedGoogleMapsLink(place)).toContain('Gimlet');
  });

  it('a saved Google Maps page is used as it is, with no lookup', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { checkedGoogleMapsLink } = await load();
    const url = 'https://www.google.com/maps/place/Gimlet/@-37.8,144.9';
    expect(await checkedGoogleMapsLink({ ...place, source_id: url })).toBe(url);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// Runs public/sw.js in a pretend service worker and fires its events.
function loadServiceWorker({ windows = [] } = {}) {
  const listeners = {};
  const shown = [];
  const opened = [];
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    registration: { showNotification: async (title, options) => shown.push({ title, ...options }) },
    clients: { matchAll: async () => windows, openWindow: async (url) => opened.push(url), claim: async () => {} },
    location: { origin: 'https://reel-map.test' },
    skipWaiting: () => {},
  };
  vm.runInNewContext(readFileSync(join(here, '../../public/sw.js'), 'utf8'), { self, caches: {}, fetch: () => {}, URL, Promise });
  const fire = async (type, event) => {
    let waited;
    listeners[type]({ ...event, waitUntil: (p) => { waited = p; } });
    await waited;
  };
  return { fire, shown, opened };
}

describe('journey: Friday pick push → notification → tap opens the place', () => {
  it('shows the title, body and icon from the push', async () => {
    const sw = loadServiceWorker();
    await sw.fire('push', { data: { json: () => ({ title: 'This Friday?', body: 'Gimlet. Tap to plan it.', url: '/?pick=p1' }) } });
    expect(sw.shown).toEqual([expect.objectContaining({ title: 'This Friday?', body: 'Gimlet. Tap to plan it.', icon: '/icon-192.png', data: { url: '/?pick=p1' } })]);
  });

  it('a push with no data still shows something', async () => {
    const sw = loadServiceWorker();
    await sw.fire('push', {});
    expect(sw.shown[0]).toMatchObject({ title: 'Reel Map', data: { url: '/' } });
  });

  it('tapping reuses an open app window, else opens a new one', async () => {
    const win = { focus: vi.fn(), navigate: vi.fn() };
    const open = loadServiceWorker({ windows: [win] });
    const close = vi.fn();
    await open.fire('notificationclick', { notification: { close, data: { url: '/?pick=p1' } } });
    expect(close).toHaveBeenCalled();
    expect(win.navigate).toHaveBeenCalledWith('/?pick=p1');
    expect(win.focus).toHaveBeenCalled();

    const fresh = loadServiceWorker();
    await fresh.fire('notificationclick', { notification: { close, data: { url: '/?pick=p2' } } });
    expect(fresh.opened).toEqual(['/?pick=p2']);
  });
});

describe('journey: Friday pick sender → each device gets its pick → dead devices removed', () => {
  // Rows per table, with select/eq/in and delete().eq() like supabase-js.
  function fakeSupabase(tables) {
    const deleted = [];
    return {
      deleted,
      from(table) {
        let rows = tables[table] ?? [];
        let deleting = false;
        const query = {
          select: () => query,
          delete: () => { deleting = true; return query; },
          eq: (column, value) => {
            if (deleting) deleted.push({ table, [column]: value });
            rows = rows.filter((r) => r[column] === value);
            return query;
          },
          in: (column, values) => { rows = rows.filter((r) => values.includes(r[column])); return query; },
          then: (resolve) => resolve({ data: rows, error: null }),
        };
        return query;
      },
    };
  }

  it('two devices for one user share a pick; a gone (410) device is removed; a server error (500) is kept', async () => {
    const db = fakeSupabase({
      collection_members: [{ user_id: 'me', collection_id: 'c' }, { user_id: 'nobody', collection_id: 'empty' }],
      collection_places: [{ collection_id: 'c', place_id: 'p1', places: { id: 'p1', name: 'Gimlet' } }],
      bookings: [],
    });
    const subs = [
      { id: 's1', user_id: 'me', endpoint: 'phone' },
      { id: 's2', user_id: 'me', endpoint: 'laptop-gone' },
      { id: 's3', user_id: 'me', endpoint: 'server-error' },
      { id: 's4', user_id: 'nobody', endpoint: 'no-places' },
    ];
    const payloads = [];
    const send = async (sub, payload) => {
      if (sub.endpoint === 'laptop-gone') throw Object.assign(new Error('gone'), { statusCode: 410 });
      if (sub.endpoint === 'server-error') throw Object.assign(new Error('oops'), { statusCode: 500 });
      payloads.push([sub.endpoint, JSON.parse(payload)]);
    };

    expect(await sendPicks(db, subs, send)).toEqual({ sent: 1, removed: 1 });
    expect(payloads).toEqual([['phone', { title: 'This Friday?', body: 'Gimlet. Tap to plan it.', url: '/?pick=p1' }]]);
    expect(db.deleted).toEqual([{ table: 'push_subscriptions', id: 's2' }]);
  });
});
