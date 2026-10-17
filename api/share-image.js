const fs = require('fs');
const path = require('path');
const { loadShare, areaOf, bookingWhen, streetOf } = require('./_lib/share-card');

// The app's own faces (SIL Open Font License, see api/_lib/fonts): Figtree for text, Bricolage for big type.
const FONTS = [
  { name: 'Figtree', weight: 700, file: 'figtree-latin-700-normal.woff' },
  { name: 'Bricolage', weight: 800, file: 'bricolage-grotesque-latin-800-normal.woff' },
].map(({ name, weight, file }) => ({ name, weight, style: 'normal', data: fs.readFileSync(path.join(__dirname, '_lib', 'fonts', file)) }));

// The picture on a shared place's link card, 1200×1044: a drawn street map with a pin, and a white
// label with the place. A collection of more than one person adds its members' initials and votes;
// a booking adds a BOOKED stamp with the date. The map is drawn here, not taken from any map service.
const W = 1200;
const H = 1044;
const ACCENT = '#d4421d';
const INK = '#16182a';
const GREY = '#5b6170';
const GREEN = '#2f8f58';
const FACE_COLOURS = ['#d4421d', '#3b6fd8', '#2f8f58', '#8a55c9', '#c98a14', '#1f8a9e'];
const MAX_FACES = 5;

// A tiny element builder for @vercel/og (no JSX in these functions).
const el = (type, style, children, props = {}) => ({ type, props: { style, children, ...props } });
const div = (style, children) => el('div', { display: 'flex', fontFamily: 'Figtree', ...style }, children);
const svg = (width, height, viewBox, shapes, style = {}) => el('svg', { width, height, ...style }, shapes, { width, height, viewBox });
const shape = (type, attrs) => el(type, undefined, undefined, attrs);

const badge = () => div({
  position: 'absolute', top: 40, right: 40, width: 128, height: 128, borderRadius: 34, background: ACCENT,
  alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 72, fontFamily: 'Bricolage', fontWeight: 800,
}, 'r.');

// Two street layouts, picked by the place id, so different places don't all look the same.
const LAYOUTS = [
  {
    park: [700, 60, 340, 220],
    roads: [['M0 300 L1200 220', 70], ['M0 640 L1200 580', 50], ['M340 0 L440 1044', 60], ['M860 0 L800 1044', 40], ['M0 920 L600 1044', 30]],
    water: 'M0 80 Q300 140 600 40',
    label: { left: 40, top: 236, rotate: -3.8 },
  },
  {
    park: [100, 600, 220, 180],
    roads: [['M0 400 L1200 460', 70], ['M0 120 L1200 160', 40], ['M600 0 L560 1044', 60], ['M1000 0 L1080 1044', 40], ['M140 0 L220 600', 30]],
    water: 'M700 1044 Q900 900 1200 960',
    label: { left: 40, top: 352, rotate: 2.8 },
  },
];

function map(place, pinTop) {
  const layout = LAYOUTS[parseInt(place.id.slice(-1), 16) % LAYOUTS.length];
  const [px, py, pw, ph] = layout.park;
  const street = streetOf(place.address);
  return [
    svg(W, H, `0 0 ${W} ${H}`, [
      shape('rect', { x: 0, y: 0, width: W, height: H, fill: '#eef1ea' }),
      shape('rect', { x: px, y: py, width: pw, height: ph, rx: 30, fill: '#d5e7cf' }),
      shape('path', { d: layout.water, stroke: '#c9dcef', 'stroke-width': 50, fill: 'none' }),
      ...layout.roads.map(([d, width]) => shape('path', { d, stroke: '#ffffff', 'stroke-width': width, fill: 'none' })),
    ], { position: 'absolute', top: 0, left: 0 }),
    street && div({
      position: 'absolute', left: layout.label.left, top: layout.label.top, transform: `rotate(${layout.label.rotate}deg)`,
      color: '#9aa39a', fontSize: 30, fontWeight: 700, letterSpacing: 2,
    }, street),
    div({ position: 'absolute', left: W / 2 - 130, top: pinTop - 40, width: 260, height: 80, borderRadius: 130, background: 'rgba(212,66,29,0.18)' }, []),
    svg(170, 226, '0 0 30 40', [
      shape('path', { d: 'M15 0C6.7 0 0 6.6 0 14.8 0 26 15 40 15 40s15-14 15-25.2C30 6.6 23.3 0 15 0z', fill: ACCENT }),
      shape('circle', { cx: 15, cy: 14.5, r: 5.6, fill: '#fff' }),
    ], { position: 'absolute', left: W / 2 - 85, top: pinTop - 226 }),
  ].filter(Boolean);
}

// A vote's mark on a face, drawn rather than emoji so the picture never depends on downloading emoji.
function mark(person) {
  const circle = (background, child) => div({
    position: 'absolute', right: -8, bottom: -8, width: 52, height: 52, borderRadius: 26, background, border: '5px solid #fff',
    alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 30, fontWeight: 700,
  }, child);
  if (person.booked) return circle(GREEN, svg(28, 28, '0 0 24 24', [shape('path', { d: 'M4 12.5l5 5L20 6.5', stroke: '#fff', 'stroke-width': 4, fill: 'none' })]));
  if (person.feeling === 'keen') return circle('#ff6a1a', svg(30, 30, '0 0 24 24', [shape('path', { d: 'M12 1.5c1 4.2 6 6.4 6 12a6 6 0 0 1-12 0c0-2.6 1.2-4.3 2.6-5.6 0 2.3.9 3.6 2.2 3.6 0-3.3-.8-6.4 1.2-10z', fill: '#fff' })]));
  if (person.feeling === 'maybe') return circle('#e2a614', '?');
  if (person.feeling === 'meh') return circle('#8d93a5', '–');
  return null;
}

function faces(crew) {
  const shown = crew.slice(0, MAX_FACES);
  const extra = crew.length - shown.length;
  return div({ alignItems: 'center' }, [
    ...shown.map((person, index) => div({
      position: 'relative', width: 124, height: 124, borderRadius: 62, marginLeft: index ? -26 : 0, border: '8px solid #fff',
      background: FACE_COLOURS[parseInt(person.userId.slice(0, 2), 16) % FACE_COLOURS.length],
      alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 52, fontFamily: 'Bricolage', fontWeight: 800,
    }, [person.initial, mark(person)].filter(Boolean))),
    extra > 0 && div({ marginLeft: 18, fontSize: 40, fontWeight: 700, color: GREY }, `+${extra}`),
  ].filter(Boolean));
}

function stamp(day) {
  return div({
    flexDirection: 'column', alignItems: 'center', border: `7px solid ${GREEN}`, borderRadius: 24, padding: '10px 24px',
    color: GREEN, transform: 'rotate(-6deg)',
  }, [
    div({ fontSize: 28, fontWeight: 700, letterSpacing: 3 }, 'BOOKED'),
    div({ fontSize: 54, fontFamily: 'Bricolage', fontWeight: 800, lineHeight: 1 }, day.toUpperCase()),
  ]);
}

const capitalised = (text) => String(text || '').replace(/^\p{L}/u, (letter) => letter.toUpperCase());

function card(share) {
  const { place, booking, crew } = share;
  const { suburb, timeZone } = areaOf(place.address);
  const when = booking ? bookingWhen(booking.plannedAt, timeZone) : null;
  const keen = crew?.filter((person) => person.feeling === 'keen').length ?? 0;
  const count = crew && (keen ? `${keen} keen` : `${crew.length} in the group`);
  const details = [when ? when.time : capitalised(place.category), suburb].filter(Boolean).join(' · ');
  // With faces, they and the stamp share a row above the name; on its own, the stamp sits beside the name.
  const topRow = crew
    ? div({ justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 18 }, [faces(crew), when && stamp(when.day)].filter(Boolean))
    : null;
  const nameBlock = div({ flexDirection: 'column', flexShrink: 1 }, [
    div({ fontSize: place.name.length > 22 ? 64 : 80, fontFamily: 'Bricolage', fontWeight: 800, color: INK, lineHeight: 1.05 }, place.name),
    div({ fontSize: 42, fontWeight: 700, color: GREY, marginTop: 10 }, [
      details,
      count && div({ color: ACCENT, marginLeft: 14 }, `· ${count}`),
    ].filter(Boolean)),
  ]);

  return div({ position: 'relative', width: W, height: H, background: '#eef1ea' }, [
    ...map(place, crew ? 380 : 470),
    badge(),
    div({
      position: 'absolute', left: 56, right: 56, bottom: 56, flexDirection: 'column', background: '#fff', borderRadius: 48,
      padding: '40px 52px', boxShadow: '0 12px 48px rgba(20,30,20,0.18)',
    }, crew || !when
      ? [topRow, nameBlock].filter(Boolean)
      : [div({ justifyContent: 'space-between', alignItems: 'center', gap: 32 }, [nameBlock, stamp(when.day)])]),
  ]);
}

module.exports = async function handler(req, res) {
  try {
    const share = await loadShare(String(req.query.id || ''), { group: String(req.query.g || ''), booking: String(req.query.c || '') });
    if (!share) return res.status(404).send('Not found');
    const { ImageResponse } = await import('@vercel/og');
    const image = new ImageResponse(card(share), { width: W, height: H, fonts: FONTS });
    const png = Buffer.from(await image.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    // Votes change, so the picture is only kept for an hour.
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(png);
  } catch (error) {
    console.error('[share-image] failed:', error);
    return res.status(500).send('Could not make the picture');
  }
};
