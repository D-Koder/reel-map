#!/usr/bin/env node
// Times the cheap cover-only route: Instagram oEmbed, then fetch the cover image.
// Usage: node tools/cover-timing/timing.mjs <reel-url> [reel-url ...]
// Requires Node 18+ (global fetch). Runs one Reel at a time so the timings are clean.

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const reelUrls = process.argv.slice(2);

if (reelUrls.length === 0) {
  console.error('Pass at least one Reel link, e.g. node tools/cover-timing/timing.mjs https://www.instagram.com/reel/XXXX/');
  process.exit(1);
}

async function timeReel(reelUrl) {
  const row = { reel: reelUrl.slice(0, 45) };
  const started = performance.now();

  const oembedUrl = new URL('https://www.instagram.com/api/v1/oembed/');
  oembedUrl.searchParams.set('url', reelUrl);
  try {
    const oembedStart = performance.now();
    const response = await fetch(oembedUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    row.oembedStatus = response.status;
    row.oembedMs = Math.round(performance.now() - oembedStart);
    if (!response.ok) return finish(row, started);

    const data = await response.json();
    row.hasCaption = Boolean(data.title);
    row.hasCover = Boolean(data.thumbnail_url);
    if (data.thumbnail_url) {
      const imageStart = performance.now();
      const image = await fetch(data.thumbnail_url, { signal: AbortSignal.timeout(12000) });
      const bytes = (await image.arrayBuffer()).byteLength;
      row.imageStatus = image.status;
      row.imageMs = Math.round(performance.now() - imageStart);
      row.imageKB = Math.round(bytes / 1024);
    }
  } catch (error) {
    row.error = error.name === 'TimeoutError' ? 'timeout' : error.message;
  }
  return finish(row, started);
}

function finish(row, started) {
  row.totalMs = Math.round(performance.now() - started);
  return row;
}

const results = [];
for (const reelUrl of reelUrls) results.push(await timeReel(reelUrl));
console.table(results);

const successful = results.filter((row) => !row.error && row.oembedStatus === 200);
if (successful.length) {
  const average = Math.round(successful.reduce((sum, row) => sum + row.totalMs, 0) / successful.length);
  console.log(`Average total: ${average} ms over ${successful.length} successful request(s)`);
}
