// A RedNote note read with one plain request, no browser: the short link redirects to the note's page,
// whose HTML carries the note's own data (window.__INITIAL_STATE__) and meta tags. Much lighter than
// Chrome, and less likely to be stopped by a bot check. Returns { reel } or { reason }.
const { isRedNoteUrl } = require('./reel-url');

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const metaContent = (html, key) => {
  const tag = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, 'i'))?.[0] ?? '';
  return (tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
};

// The note inside the page's state script, or null. The state is JavaScript (it has "undefined"), not strict JSON.
function noteFromState(html) {
  const start = html.indexOf('window.__INITIAL_STATE__=');
  if (start < 0) return null;
  const end = html.indexOf('</script>', start);
  const body = html.slice(start + 'window.__INITIAL_STATE__='.length, end < 0 ? undefined : end).trim().replace(/;$/, '');
  try {
    const state = JSON.parse(body.replace(/\bundefined\b/g, 'null'));
    const details = state?.note?.noteDetailMap ?? {};
    return Object.values(details).find((entry) => entry?.note?.title || entry?.note?.desc)?.note ?? null;
  } catch {
    return null;
  }
}

async function fetchRedNote(reelUrl) {
  let response;
  try {
    response = await fetch(reelUrl, {
      redirect: 'follow',
      headers: { 'user-agent': MOBILE_UA, 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8', accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    return { reason: `request failed: ${error.message}` };
  }
  const html = await response.text().catch(() => '');
  const landed = new URL(response.url).hostname;
  // A redirect that left RedNote (an open redirect on one of its pages) is not read or passed on.
  if (!isRedNoteUrl(response.url)) return { reason: `redirected away from RedNote to ${landed}` };
  if (!response.ok) return { reason: `HTTP ${response.status} from ${landed}` };
  const note = noteFromState(html);
  const title = note?.title || metaContent(html, 'og:title').replace(/\s*-\s*小红书$/, '');
  const desc = note?.desc || metaContent(html, 'description') || metaContent(html, 'og:description');
  const caption = [title, desc].filter((part, index, all) => part && all.indexOf(part) === index).join('\n').trim();
  if (!caption) return { reason: `page from ${landed} had no note text (${html.length} bytes)${/captcha|verify|登录|login/i.test(html) ? ', looks like a login or check' : ''}` };
  const tags = (note?.tagList ?? []).map((tag) => (tag?.name ? `#${tag.name}` : '')).filter(Boolean);
  return {
    // Whether the page gave the note itself or only its meta description (which RedNote may cut short).
    reason: '',
    complete: Boolean(note?.desc),
    reel: {
      success: true, reelUrl, caption, creator: note?.user?.nickname || null, likes: null, comments: null,
      placeName: '', location: '', posterLocation: note?.ipLocation || '', date: note?.time ? new Date(note.time).toISOString() : '',
      hashtags: tags.length ? tags : [...caption.matchAll(/#[\p{L}\p{N}_]+/gu)].map((match) => match[0]),
      videoUrl: '', thumbnailUrl: note?.imageList?.[0]?.urlDefault || metaContent(html, 'og:image'), source: 'rednote',
    },
  };
}

module.exports = { fetchRedNote };
