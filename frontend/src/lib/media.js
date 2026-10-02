export function normalizeImageUrl(value) {
  let candidate = String(value ?? '')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .trim();
  const cssUrl = candidate.match(/^url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)$/i);
  if (cssUrl) candidate = (cssUrl[1] ?? cssUrl[2] ?? cssUrl[3] ?? '').trim();
  candidate = candidate.replace(/^['"]|['"]$/g, '').trim();
  if (candidate.startsWith('//')) candidate = `https:${candidate}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}