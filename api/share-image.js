const fs = require('fs');
const path = require('path');
const { loadShare, areaOf, bookingWhen, coverDataUrl } = require('./_lib/share-card');

// The app's own faces (SIL Open Font License, see api/_lib/fonts): Figtree for text, Bricolage for big type.
const FONTS = [
  { name: 'Figtree', weight: 700, file: 'figtree-latin-700-normal.woff' },
  { name: 'Bricolage', weight: 800, file: 'bricolage-grotesque-latin-800-normal.woff' },
].map(({ name, weight, file }) => ({ name, weight, style: 'normal', data: fs.readFileSync(path.join(__dirname, '_lib', 'fonts', file)) }));

// The picture on a shared place's link card, 1200×1044.
//   Place (option A): the reel cover, a play button, the reel map badge and a pin with the suburb.
//   Booking (option D, ?c=<collection>): the cover darkened at the bottom, BOOKED, then the date and time.
// A place without a reel cover gets the reel map colours with its name instead.
const W = 1200;
const H = 1044;
const ACCENT = '#d4421d';
const NAVY = '#12162a';

// A tiny element builder for @vercel/og (no JSX in these functions).
const el = (type, style, children, props = {}) => ({ type, props: { style, children, ...props } });
const div = (style, children) => el('div', { display: 'flex', fontFamily: 'Figtree', ...style }, children);

const badge = () => div({
  position: 'absolute', top: 36, right: 36, width: 120, height: 120, borderRadius: 30, background: ACCENT,
  alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 64, fontFamily: 'Bricolage', fontWeight: 800,
}, 'r.');

// Icons are drawn as SVG, not emoji, so making the picture never depends on downloading emoji images.
const svg = (size, paths) => el('svg', { width: size, height: size }, paths.map((d) => el('path', undefined, undefined, { d, fill: '#fff' })), { width: size, height: size, viewBox: '0 0 24 24' });
const PIN = ['M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z'];
const CALENDAR = ['M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zm12 8H5v10h14V10z'];

const pill = (icon, text, background, style = {}) => div({
  position: 'absolute', alignItems: 'center', gap: 12, padding: '14px 28px', borderRadius: 999, background, color: '#fff', fontSize: 40, fontWeight: 700, ...style,
}, [svg(40, icon), text]);

function background(cover, name) {
  if (cover) return el('img', { position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' }, undefined, { src: cover, width: W, height: H });
  return div({
    position: 'absolute', top: 0, left: 0, width: W, height: H, padding: 90, alignItems: 'center', justifyContent: 'center',
    background: `linear-gradient(145deg, #2a3360, ${NAVY})`, color: '#f1eee8', fontSize: 96, fontFamily: 'Bricolage', fontWeight: 800, textAlign: 'center', lineHeight: 1.1,
  }, name);
}

function placeCard(place, cover) {
  const { suburb } = areaOf(place.address);
  return div({ position: 'relative', width: W, height: H, background: NAVY }, [
    background(cover, place.name),
    cover && div({ position: 'absolute', top: H * 0.45 - 90, left: W / 2 - 90, width: 180, height: 180, borderRadius: 90, background: 'rgba(0,0,0,0.38)', alignItems: 'center', justifyContent: 'center' }, [
      el('svg', { width: 84, height: 84, marginLeft: 12 }, [el('path', undefined, undefined, { d: 'M6 3l15 9-15 9z', fill: '#fff' })], { width: 84, height: 84, viewBox: '0 0 24 24' }),
    ]),
    badge(),
    suburb && pill(PIN, suburb, 'rgba(0,0,0,0.6)', { left: 36, bottom: 40 }),
  ].filter(Boolean));
}

function bookingCard(place, cover, booking) {
  const { suburb, timeZone } = areaOf(place.address);
  const { day, time } = bookingWhen(booking.plannedAt, timeZone);
  return div({ position: 'relative', width: W, height: H, background: NAVY }, [
    background(cover, place.name),
    div({ position: 'absolute', top: 0, left: 0, width: W, height: H, background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.8) 100%)' }, []),
    badge(),
    pill(CALENDAR, 'BOOKED', '#2e9e5b', { left: 40, top: 40 }),
    div({ position: 'absolute', left: 48, right: 48, bottom: 48, flexDirection: 'column', color: '#fff' }, [
      div({ fontSize: 120, fontFamily: 'Bricolage', fontWeight: 800, lineHeight: 1.05 }, day),
      div({ fontSize: 52, fontWeight: 600, marginTop: 10, opacity: 0.92 }, suburb ? `${time} · ${suburb}` : time),
    ]),
  ]);
}

module.exports = async function handler(req, res) {
  try {
    const share = await loadShare(String(req.query.id || ''), String(req.query.c || ''));
    if (!share) return res.status(404).send('Not found');
    const cover = await coverDataUrl(share.place);
    const { ImageResponse } = await import('@vercel/og');
    const tree = share.booking ? bookingCard(share.place, cover, share.booking) : placeCard(share.place, cover);
    const image = new ImageResponse(tree, { width: W, height: H, fonts: FONTS });
    const png = Buffer.from(await image.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    // Cached a day: the cover is baked in, so an expired Instagram link doesn't matter.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).send(png);
  } catch (error) {
    console.error('[share-image] failed:', error);
    return res.status(500).send('Could not make the picture');
  }
};
