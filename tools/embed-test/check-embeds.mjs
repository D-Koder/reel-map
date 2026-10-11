// Checks whether an Instagram reel and a TikTok video can be embedded in an iframe.
// Run: node tools/embed-test/check-embeds.js
// For each link it asks the platform for its embed page and reports:
//   - whether the embed page responds OK
//   - whether the platform blocks framing (X-Frame-Options / frame-ancestors)
//   - whether the platform offers an oEmbed record (used for captions and thumbnails)

const TEST_LINKS = [
  { platform: 'TikTok', url: 'https://www.tiktok.com/@eatwithkevin/video/7691441266743086388' },
  { platform: 'Instagram', url: 'https://www.instagram.com/reel/DcQICfPx5TV/' },
];

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
};

// Each platform's iframe URL for the same video.
function embedUrlFor(platform, url) {
  if (platform === 'TikTok') {
    const id = url.match(/\/video\/(\d+)/)?.[1];
    return id ? `https://www.tiktok.com/embed/v2/${id}` : null;
  }
  const code = url.match(/\/(?:reel|p)\/([^/?#]+)/)?.[1];
  return code ? `https://www.instagram.com/reel/${code}/embed/` : null;
}

function oembedUrlFor(platform, url) {
  if (platform === 'TikTok') return `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  // Instagram's oEmbed endpoint needs a Meta access token, so it is skipped here.
  return null;
}

async function check({ platform, url }) {
  const result = { platform, url, embedOk: false, framingBlocked: null, oembed: 'not checked' };
  const embed = embedUrlFor(platform, url);
  if (!embed) {
    result.error = 'Could not build an embed URL from this link';
    return result;
  }

  try {
    const res = await fetch(embed, { headers: BROWSER_HEADERS, redirect: 'follow' });
    const xfo = res.headers.get('x-frame-options');
    const csp = res.headers.get('content-security-policy') || '';
    const frameAncestors = csp.match(/frame-ancestors([^;]*)/i)?.[1]?.trim() ?? null;
    result.embedStatus = res.status;
    result.embedOk = res.ok;
    result.framingBlocked = Boolean(xfo) || (frameAncestors !== null && !/\*/.test(frameAncestors));
    result.xFrameOptions = xfo;
    result.frameAncestors = frameAncestors;
  } catch (error) {
    result.error = `Embed request failed: ${error.message}`;
  }

  const oembed = oembedUrlFor(platform, url);
  if (oembed) {
    try {
      const res = await fetch(oembed, { headers: BROWSER_HEADERS });
      const body = await res.json().catch(() => null);
      result.oembed = res.ok && body?.html ? `OK, title: "${body.title ?? ''}"` : `HTTP ${res.status}`;
      result.thumbnail = body?.thumbnail_url ?? null;
    } catch (error) {
      result.oembed = `failed: ${error.message}`;
    }
  }
  return result;
}

const results = [];
for (const link of TEST_LINKS) results.push(await check(link));
console.table(results.map(({ platform, embedStatus, embedOk, framingBlocked, oembed, error }) => ({
  platform, embedStatus, embedOk, framingBlocked, oembed, error: error ?? '',
})));
console.log(JSON.stringify(results, null, 2));
