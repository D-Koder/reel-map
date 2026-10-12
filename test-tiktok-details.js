#!/usr/bin/env node
/**
 * Checks what Reel Map can read from TikTok videos, the same way it reads Instagram reels.
 *
 *   node test-tiktok-details.js <tiktok-url> [more-urls] [--no-maps]
 *
 * For each link it tries:
 *   1. TikTok's oEmbed: a quick plain request, no browser. (Not used by the app yet; this test shows if it's worth adding.)
 *   2. The app's Chrome scraper, plus the Google Maps search using the background rules:
 *      Maps details only when the search finds exactly one place. --no-maps skips Maps.
 *
 * Prints a short checklist per link and saves everything to tiktok-test-results.json.
 * TikTok lookups are never cached, so this doesn't write anything to the database.
 */

const fs = require('node:fs');
const scrapeReel = require('./api/scrape-reel');
const enrichReel = require('./api/enrich-reel');

process.env.PUPPETEER_EXECUTABLE_PATH ||= require('puppeteer').executablePath();

const args = process.argv.slice(2);
const withMaps = !args.includes('--no-maps');
const urls = args.filter((arg) => arg.startsWith('https://'));
if (!urls.length) {
  console.error('Usage: node test-tiktok-details.js <tiktok-url> [more-urls] [--no-maps]');
  process.exit(2);
}

// The same 📍 rule the app uses to find the venue written in a caption.
const venueInCaption = (caption) => String(caption || '').match(/[📍📌]\s*([^\n#()🏷]+)/u)?.[1].trim() || '';

async function timed(work) {
  const started = Date.now();
  try {
    const result = await work();
    return { ...result, ms: Date.now() - started };
  } catch (error) {
    return { ms: Date.now() - started, error: error.message };
  }
}

async function tryOembed(url) {
  const oembedUrl = new URL('https://www.tiktok.com/oembed');
  oembedUrl.searchParams.set('url', url);
  const response = await fetch(oembedUrl, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) return { error: `TikTok oEmbed returned HTTP ${response.status}` };
  const data = await response.json();
  return {
    caption: data.title || '',
    creator: data.author_unique_id || data.author_name || '',
    thumbnailUrl: data.thumbnail_url || '',
  };
}

// Calls an API handler the way Vercel would and returns { status, body }.
async function callHandler(handler, req) {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({ method: 'POST', ...req }, res);
  return { status: res.statusCode, body: res.body };
}

async function tryScraper(url) {
  const handler = withMaps ? enrichReel : scrapeReel;
  const { status, body } = await callHandler(handler, { body: { reelUrl: url }, backgroundOnly: true });
  if (status >= 400 || !body?.success) return { error: body?.error || `HTTP ${status}` };
  return {
    caption: body.caption || '',
    creator: body.creator || '',
    thumbnailUrl: body.thumbnailUrl || '',
    placeName: body.placeName || '',
    location: body.location || '',
    maps: body.maps,
  };
}

const tick = (value) => (value ? '✅' : '❌');
const short = (text, length = 70) => {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length)}…` : flat;
};

function report(url, oembed, scraper) {
  console.log(`\n━━━ ${url}`);

  console.log(`\n1️⃣  Quick lookup (oEmbed) — ${(oembed.ms / 1000).toFixed(1)}s`);
  if (oembed.error) console.log(`   ❌ ${oembed.error}`);
  else {
    console.log(`   ${tick(oembed.caption)} Caption:  ${short(oembed.caption)}`);
    console.log(`   ${tick(oembed.creator)} Creator:  ${oembed.creator}`);
    console.log(`   ${tick(oembed.thumbnailUrl)} Cover`);
    console.log(`   ${tick(venueInCaption(oembed.caption))} 📍 venue: ${venueInCaption(oembed.caption) || '(none in caption)'}`);
  }

  console.log(`\n2️⃣  App scraper (Chrome${withMaps ? ' + Maps' : ''}) — ${(scraper.ms / 1000).toFixed(1)}s`);
  if (scraper.error) console.log(`   ❌ ${scraper.error}`);
  else {
    console.log(`   ${tick(scraper.caption)} Caption:  ${short(scraper.caption)}`);
    console.log(`   ${tick(scraper.creator)} Creator:  ${scraper.creator}`);
    console.log(`   ${tick(scraper.thumbnailUrl)} Cover`);
    console.log(`   ${tick(venueInCaption(scraper.caption))} 📍 venue: ${venueInCaption(scraper.caption) || '(none in caption)'}`);
    if (withMaps) {
      const maps = scraper.maps || {};
      const count = maps.candidates?.length ?? 0;
      if (!maps.success) console.log(`   ❌ Maps: ${maps.error || 'search failed'}`);
      else if (count === 1) console.log(`   ✅ Maps: 1 clear match → ${maps.details?.name || maps.selectedCandidate?.name}${maps.details?.address ? `, ${maps.details.address}` : ''}`);
      else console.log(`   ⏸️  Maps: ${count} results → left for you to pick (not unsupervised)`);
    }
  }

  if (!oembed.error && !scraper.error) {
    const same = short(oembed.caption, 1000) === short(scraper.caption, 1000);
    console.log(`\n   Captions match: ${same ? '✅ yes, the quick lookup is enough' : '⚠️  no, compare them in the JSON file'}`);
  }
}

(async () => {
  const results = [];
  for (const url of urls) {
    const oembed = await timed(() => tryOembed(url));
    const scraper = await timed(() => tryScraper(url));
    report(url, oembed, scraper);
    results.push({ url, oembed, scraper });
  }
  fs.writeFileSync('tiktok-test-results.json', `${JSON.stringify(results, null, 2)}\n`);
  console.log('\n📄 Full details saved to tiktok-test-results.json');
})().catch((error) => {
  console.error('TikTok test failed:', error);
  process.exitCode = 1;
});
