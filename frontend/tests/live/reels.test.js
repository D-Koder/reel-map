// Live check against the real Instagram / TikTok / Google Maps, to catch them changing their pages.
// Not part of the normal runs: slow, needs Chrome (run `npm ci` in the repo root WITHOUT
// PUPPETEER_SKIP_DOWNLOAD), and the sites can rate-limit. Run by hand, e.g. weekly:
//   LIVE_INSTAGRAM_URL=https://www.instagram.com/reel/… LIVE_TIKTOK_URL=https://www.tiktok.com/@…/video/… npm run test:live
// Pick reels whose captions have a 📍 venue.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const scrapeReel = require('../../../api/_lib/scrape-reel.js');
const enrichReel = require('../../../api/enrich-reel.js');

const call = async (handler, body) => {
  const res = { status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; return this; } };
  res.statusCode = 200;
  await handler({ method: 'POST', body }, res);
  return res;
};

const cases = [['Instagram', process.env.LIVE_INSTAGRAM_URL], ['TikTok', process.env.LIVE_TIKTOK_URL]];

describe.each(cases)('live %s', (platform, url) => {
  it.skipIf(!url)(`${platform}: reads the caption and finds a venue`, async () => {
    const res = await call(scrapeReel, { reelUrl: url });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(res.body.caption, `${platform} gave no caption: its page may have changed`).not.toBe('');
    expect(res.body.placeName || res.body.location, 'no 📍 venue found in the caption').toBeTruthy();
  }, 90000);

  it.skipIf(!url)(`${platform}: the full lookup reaches Google Maps`, async () => {
    const res = await call(enrichReel, { reelUrl: url });
    expect(res.statusCode).toBe(200);
    expect(res.body.unreadable, 'the reel could not be read at all').toBeFalsy();
    expect(res.body.maps?.candidates?.length, 'Google Maps found nothing: its page may have changed').toBeGreaterThan(0);
  }, 120000);
});
