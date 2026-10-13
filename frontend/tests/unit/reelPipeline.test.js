// The server side of "paste a reel → place saved": reading the reel, choosing the Google result,
// the shared lookup cache, and the iPhone Shortcut endpoint. The network is faked, so no Chrome,
// Instagram, Google or Supabase is needed.
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// The API reads these once, when it loads.
process.env.SUPABASE_URL = 'https://cache.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';

const require = createRequire(import.meta.url);
const scrapeReel = require('../../../api/_lib/scrape-reel.js');
const enrichReel = require('../../../api/enrich-reel.js');
const saveReel = require('../../../api/save-reel.js');
const { bestPlaceMatch } = await import('../../src/lib/places.js');

// A fake Vercel response that records what the handler sent.
function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; },
  };
}
const call = async (handler, body, extra = {}) => {
  const res = fakeRes();
  await handler({ method: 'POST', body, headers: { host: 'reel-map.test' }, ...extra }, res);
  return res;
};

// fetch that answers by URL. Each route is [test(url, init), response body, status].
function fakeFetch(routes) {
  const calls = [];
  const fn = vi.fn(async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes.find(([test]) => test(url, init));
    if (!route) return new Response('[]', { status: 200 });
    const [, body, status = 200] = route;
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('reading a caption on the server', () => {
  it.each([
    ['"Name:" and "Address:" lines win', 'So good!\nName: Gimlet\nAddress: 33 Russell St\n📍 Somewhere else', { placeName: 'Gimlet', location: '33 Russell St' }],
    ['"Venue - Suburb" splits in two', '📍 Pho Bar - Richmond', { placeName: 'Pho Bar', location: 'Richmond' }],
    ['"Venue – Suburb" with an en dash', '📍 Tipo 00 – Melbourne CBD', { placeName: 'Tipo 00', location: 'Melbourne CBD' }],
    ['no dash: it is all location', '📍 Gimlet, Russell St', { placeName: '', location: 'Gimlet, Russell St' }],
    ['Name only, location from the pin', 'Name: Gimlet\n📍 Russell St, Melbourne', { placeName: 'Gimlet', location: 'Russell St, Melbourne' }],
    ['nothing at all', 'just vibes', { placeName: '', location: '' }],
  ])('%s', (_style, caption, expected) => {
    expect(scrapeReel.parseCaptionDetails(caption)).toEqual(expected);
  });

  it.each([['1,234', 1234], ['12.5K', 12500], ['3M', 3000000], ['1.2b', 1200000000], ['', null], ['lots', null]])(
    'like count %s → %s', (text, expected) => expect(scrapeReel.parseCount(text)).toBe(expected),
  );

  it.each([
    ['https://www.instagram.com/reel/ABC/', true, false],
    ['https://instagram.com/someone/p/ABC', true, false],
    ['https://www.tiktok.com/@foodie/video/7300000000000000000', false, true],
    ['https://vm.tiktok.com/ZMabc123/', false, true],
    ['https://www.tiktok.com/@foodie', false, false],
    ['http://www.instagram.com/reel/ABC/', false, false],
    ['https://youtube.com/shorts/abc', false, false],
  ])('%s → instagram %s, tiktok %s', (url, insta, tiktok) => {
    expect(scrapeReel.isInstagramUrl(url)).toBe(insta);
    expect(scrapeReel.isTikTokUrl(url)).toBe(tiktok);
  });

  it('flips the caption so its end (usually the venue) comes first', () => {
    expect(enrichReel.flipCaption('one two three four five')).toBe('four five one two three');
  });
});

describe('TikTok page', () => {
  it('reads the caption, creator, counts and hashtags from the page', () => {
    const dom = new JSDOM(`
      <div data-e2e="video-desc">Best dumplings 🥟 📍 Dumpling Story, Hardware Ln #melbourne #dumplings</div>
      <strong data-e2e="like-count">12.3K</strong><strong data-e2e="comment-count">456</strong>
      <div data-e2e="browse-video"><video poster="https://p16.tiktokcdn.com/cover.jpg"></video></div>`,
    { url: 'https://www.tiktok.com/@foodie/video/7300000000000000000' });
    // jsdom has no layout, so no innerText; textContent is the same for this markup.
    Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('location', dom.window.location);
    const page = scrapeReel.readTikTokPage('https://www.tiktok.com/@foodie/video/7300000000000000000');
    expect(page).toMatchObject({
      creator: 'foodie',
      likes: 12300,
      comments: 456,
      hashtags: ['#melbourne', '#dumplings'],
      thumbnailUrl: 'https://p16.tiktokcdn.com/cover.jpg',
    });
    // The 📍 venue in a TikTok caption is found by the same rule as Instagram.
    expect(scrapeReel.parseCaptionDetails(page.caption).location).toBe('Dumpling Story, Hardware Ln');
  });
});

describe('choosing the Google result: server and app agree', () => {
  const sets = [
    [[{ name: 'Yoarthi' }, { name: 'Yo Art Frozen Yoghurt (The Glen)' }], ['YoArt']],
    [[{ name: 'Frenchie' }, { name: 'Le Bon' }], ['the restaurant is called Frenchie']],
    [[{ name: 'Pho Bar' }, { name: 'Pho Bar' }], ['Pho Bar']],
    [[{ name: 'Gimlet at Cavendish House' }, { name: 'Gimletto Pizza' }], ['gimlet']],
    [[{ name: 'Tipo 00' }, { name: 'Tipo Pasta' }], ['abc']],
  ];
  it.each(sets)('%j with hints %j', (candidates, hints) => {
    expect(enrichReel.bestCandidate(candidates, hints)).toBe(bestPlaceMatch(candidates, hints));
  });
});

describe('journey: Instagram reel → caption → Google result → details, from the shared cache', () => {
  const REEL = 'https://www.instagram.com/reel/ABC123/';
  const gimlet = { name: 'Gimlet at Cavendish House', url: 'https://www.google.com/maps/place/Gimlet', address: '33 Russell St' };
  const gimletto = { name: 'Gimletto Pizza', url: 'https://www.google.com/maps/place/Gimletto', address: '1 Lygon St' };
  const details = { name: 'Gimlet at Cavendish House', address: '33 Russell St, Melbourne VIC 3000', latitude: -37.8155, longitude: 144.9714 };
  const now = new Date().toISOString();

  const routes = (place = { placeName: '@gimlet', location: 'Melbourne', venue: 'Gimlet' }) => [
    [(url) => url.includes('/rest/v1/reel_lookups?key='), [{ data: { place, candidates: [gimlet, gimletto] }, updated_at: now }]],
    [(url) => url.includes('/rest/v1/place_lookups?key='), [{ data: details, updated_at: now }]],
  ];

  it('picks the clear match, reads its details, and keeps the link that was shared', async () => {
    const calls = fakeFetch(routes());
    const shared = 'https://www.instagram.com/someone/reel/ABC123/?igsh=xyz';
    const res = await call(enrichReel, { reelUrl: shared });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, reelUrl: shared, placeName: '@gimlet', source: 'cache' });
    expect(res.body.maps.selectedCandidate).toEqual(gimlet);
    expect(res.body.maps.details).toEqual(details);
    // One cache entry per reel, whatever the link looked like.
    expect(calls[0].url).toContain(`key=eq.${encodeURIComponent(REEL)}`);
    expect(calls[1].url).toContain(`key=eq.${encodeURIComponent(gimlet.url)}`);
  });

  it('each carousel slide has its own cache entry', async () => {
    const calls = fakeFetch(routes());
    await call(enrichReel, { reelUrl: `${REEL}?img_index=3` });
    expect(calls[0].url).toContain(encodeURIComponent(`${REEL}?img_index=3`));
  });

  it('the place the person tapped wins over the guess', async () => {
    fakeFetch(routes());
    const res = await call(enrichReel, { reelUrl: REEL, mapsPlaceUrl: gimletto.url });
    expect(res.body.maps.selectedCandidate).toEqual(gimletto);
  });

  it('no clear match → the person chooses (candidates, no details)', async () => {
    fakeFetch(routes({ placeName: '', location: 'Melbourne', venue: 'great food' }));
    const res = await call(enrichReel, { reelUrl: REEL });
    expect(res.body.maps).toMatchObject({ success: true, selectedCandidate: null, details: null, candidates: [gimlet, gimletto] });
  });

  it('a background lookup (iPhone Shortcut) never guesses between two results', async () => {
    const calls = fakeFetch(routes());
    const res = await call(enrichReel, { reelUrl: REEL, background: true });
    expect(res.body.maps.selectedCandidate).toBeNull();
    expect(calls.some((c) => c.url.includes('place_lookups'))).toBe(false);
  });

  it('a link that is not a reel is refused, and GET is not allowed', async () => {
    fakeFetch([]);
    const bad = await call(enrichReel, { reelUrl: 'https://youtube.com/shorts/abc' });
    expect(bad.statusCode).toBe(400);
    expect(bad.body.error).toMatch(/valid Instagram reel\/post or TikTok/);
    const get = fakeRes();
    await enrichReel({ method: 'GET' }, get);
    expect(get.statusCode).toBe(405);
  });
});

describe('journey: reading a fresh Instagram reel through oEmbed', () => {
  it('Name/Address lines, creator and hashtags come back without starting Chrome', async () => {
    fakeFetch([[(url) => url.startsWith('https://www.instagram.com/api/v1/oembed/'), {
      title: 'Date night done right 🍸\nName: Gimlet\nAddress: 33 Russell St\n#melbourne #cocktails',
      author_name: 'melbfoodie',
    }]]);
    const res = await call(scrapeReel, { reelUrl: 'https://www.instagram.com/reel/ABC123/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      source: 'oembed', creator: 'melbfoodie', placeName: 'Gimlet', location: '33 Russell St', hashtags: ['#melbourne', '#cocktails'],
    });
  });

  it('bad links are refused before anything is fetched', async () => {
    const calls = fakeFetch([]);
    for (const reelUrl of ['', 'not a link', 'https://www.tiktok.com/@foodie', 'http://instagram.com/reel/A/']) {
      expect((await call(scrapeReel, { reelUrl })).statusCode).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });
});

describe('journey: iPhone Shortcut → /api/save-reel', () => {
  const rpc = (name) => (url) => url.endsWith(`/rest/v1/rpc/${name}`);
  const sentKey = (calls) => JSON.parse(calls.find((c) => c.url.includes('/rpc/')).init.body).p_key;

  beforeAll(() => {
    process.env.SUPABASE_URL = 'https://cache.test';
  });

  it('connect → save → duplicate, with the reel looked up in the background', async () => {
    let calls = fakeFetch([[rpc('mark_shortcut_connected'), '"connected"']]);
    // A key read back from a file can carry its "reelmap-key:" prefix and a newline.
    let res = await call(saveReel, { key: 'reelmap-key:abc123\n', connect: 'true' });
    expect(res.body).toBe('✅ Reel Map connected');
    expect(sentKey(calls)).toBe('abc123');

    calls = fakeFetch([[rpc('save_shared_reel'), '"saved"']]);
    res = await call(saveReel, { key: 'abc123', url: 'Look! https://www.instagram.com/p/XYZ/?img_index=2&igsh=1 so good' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('✅ Saved to Reel Map');
    expect(res.headers['Content-Type']).toMatch(/text\/plain/);
    const background = calls.find((c) => c.url === 'https://reel-map.test/api/enrich-reel');
    expect(JSON.parse(background.init.body)).toEqual({ reelUrl: 'https://www.instagram.com/p/XYZ/', slide: 2, background: true });

    fakeFetch([[rpc('save_shared_reel'), '"duplicate"']]);
    res = await call(saveReel, { key: 'abc123', url: 'https://www.instagram.com/p/XYZ/' });
    expect(res.body).toBe('👍 Already saved to Reel Map');
  });

  it.each([
    [{ url: 'https://www.instagram.com/p/X/' }, null, 401, /Connect first/],
    [{ key: 'abc' }, null, 400, /No link was shared/],
    [{ key: 'wrong', url: 'https://www.instagram.com/p/X/' }, { code: '28000' }, 401, /needs reconnecting/],
    [{ key: 'abc', url: 'no link here' }, { code: '22023' }, 400, /No link found/],
    [{ key: 'abc', url: 'https://www.instagram.com/p/X/' }, { code: '54000' }, 429, /Too many reels/],
  ])('%j → %s', async (body, dbError, status, message) => {
    fakeFetch([[rpc('save_shared_reel'), dbError ?? {}, dbError ? 400 : 200]]);
    const res = await call(saveReel, body);
    expect(res.statusCode).toBe(status);
    expect(res.body).toMatch(message);
  });

  it('Supabase down → "Could not reach", GET → 405', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect((await call(saveReel, { key: 'abc', url: 'https://www.instagram.com/p/X/' })).statusCode).toBe(502);
    const get = fakeRes();
    await saveReel({ method: 'GET' }, get);
    expect(get.statusCode).toBe(405);
  });
});
