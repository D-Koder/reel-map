import React from 'react';

// The tour's little guide. With no `pose` it is the plain lantern. A pose gives it a face, arms and a small prop for
// the moment it is talking about: hello, pointing, thinking, celebrate, wink, oops, looking, love or sleepy.
const INK = '#1a1a18';
const BUTTER = '#ffd23f';
const ORANGE = '#e5502a';
const GOLD = '#ffb800';

const Line = ({ d, w = 2 }) => <path d={d} stroke={INK} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
const Dot = ({ x, y, r = 2 }) => <circle cx={x} cy={y} r={r} fill={INK} />;
const Hand = ({ x, y }) => <circle cx={x} cy={y} r="2.5" fill={BUTTER} stroke={INK} strokeWidth="2" />;
const Arm = ({ d, hx, hy }) => <><Line d={d} w={2.6} /><Hand x={hx} y={hy} /></>;
const Star = ({ x, y, s, c }) => <path transform={`translate(${x} ${y}) scale(${s})`} d="M0-3l.8 2.2L3 0l-2.2.8L0 3l-.8-2.2L-3 0l2.2-.8z" fill={c} />;
const Heart = ({ x, y, s, c }) => <path transform={`translate(${x} ${y}) scale(${s})`} d="M0 2.2C-3.4-.4-2.2-3.4 0-1.7 2.2-3.4 3.4-.4 0 2.2z" fill={c} />;
const Bit = ({ x, y, a, c }) => <rect x={x} y={y} width="2.2" height="4.2" rx=".6" fill={c} transform={`rotate(${a} ${x} ${y})`} />;
const Word = ({ t, x, y, size, c = ORANGE }) => (
  <text x={x} y={y} fontFamily="Bricolage Grotesque, Figtree, sans-serif" fontWeight="800" fontSize={size} fill={c}>{t}</text>
);

const EYES = {
  open: <><Dot x={16} y={27} /><Dot x={24} y={27} /></>,
  happy: <><Line d="M14 28.4q2-3.2 4 0" /><Line d="M22 28.4q2-3.2 4 0" /></>,
  wink: <><Dot x={16} y={27} /><Line d="M22 27.6q2-3 4 0" /></>,
  wide: <><circle cx="16" cy="27" r="3" fill={INK} /><circle cx="24" cy="27" r="3" fill={INK} /><circle cx="15.1" cy="26" r=".9" fill="#fff" /><circle cx="23.1" cy="26" r=".9" fill="#fff" /></>,
  sleepy: <><Line d="M13.5 27.6h5" /><Line d="M21.5 27.6h5" /></>,
  think: <><Dot x={17.2} y={26} /><Dot x={25.2} y={26} /><Line d="M12.8 22.6l6-1.6" w={1.8} /></>,
  look: <><Dot x={14.6} y={27} /><Dot x={22.6} y={27} /></>,
  love: <><Heart x={16} y={27} s={1.15} c={ORANGE} /><Heart x={24} y={27} s={1.15} c={ORANGE} /></>,
};

const MOUTH = {
  smile: <Line d="M16 32q4 3 8 0" />,
  grin: <><path d="M15 31.4h10q-.8 5.8-5 5.8t-5-5.8z" fill={INK} /><path d="M17.4 36q2.6-2 5.2 0q-2.6 1.7-5.2 0z" fill="#ff7a59" /></>,
  o: <ellipse cx="20" cy="34" rx="2" ry="2.7" fill={INK} />,
  smirk: <Line d="M16.5 33.4q4 1.6 8-1.6" />,
  flat: <Line d="M17 33.8q3 1.2 6 0" />,
  wiggle: <Line d="M15.5 33q1.6-1.8 3.2 0t3.2 0t3.2 0" />,
};

const DOWN = <><Arm d="M9 27q-4 3-4.6 8" hx={4.4} hy={35.6} /><Arm d="M31 27q4 3 4.6 8" hx={35.6} hy={35.6} /></>;
const LEFT_DOWN = <Arm d="M9 27q-4 3-4.6 8" hx={4.4} hy={35.6} />;
const ARMS = {
  down: DOWN,
  wave: <>{LEFT_DOWN}<Arm d="M31 25q6 0 8-8" hx={39} hy={16.4} /><Line d="M43 12.5q2.4 2.4 0 5" w={1.6} /><Line d="M45.6 10.5q3.4 3.4 0 7.4" w={1.6} /></>,
  point: <>{LEFT_DOWN}<Arm d="M31 28h9.5" hx={41.5} hy={28} /><Line d="M45.4 24.4q3 3.6 0 7.2" w={1.6} /></>,
  up: <><Arm d="M9 24q-5-1-6.4-9" hx={2.6} hy={14.4} /><Arm d="M31 24q5-1 6.4-9" hx={37.4} hy={14.4} /></>,
  think: <>{LEFT_DOWN}<Arm d="M31 27q6 0 6-7.4" hx={37} hy={19} /></>,
  glass: <>{LEFT_DOWN}<Arm d="M31 26q5 0 6.6-4.4" hx={38.2} hy={21.4} /></>,
};

const EXTRA = {
  none: null,
  wave: null,
  point: <Star x={47} y={20} s={0.8} c={GOLD} />,
  think: <><Word t="?" x={-5} y={9} size={13} /><Star x={-3} y={22} s={0.9} c={GOLD} /></>,
  party: <><Star x={-5} y={6} s={1.3} c={ORANGE} /><Star x={45} y={4} s={1.1} c={GOLD} /><Star x={46} y={28} s={0.8} c={ORANGE} /><Bit x={2} y={-1} a={25} c="#4cc380" /><Bit x={35} y={-3} a={-30} c="#4c8dff" /><Bit x={-4} y={22} a={60} c={GOLD} /><Bit x={44} y={12} a={-20} c={ORANGE} /></>,
  wink: <><Star x={34} y={8} s={1} c={GOLD} /><Star x={40} y={3} s={0.6} c={ORANGE} /></>,
  oops: <><Word t="!" x={33} y={12} size={15} /><path d="M37 17q-2.6 3.6 0 5.2t2.6-5.2z" fill="#8ad0ff" stroke={INK} strokeWidth="1.2" /></>,
  look: <><circle cx="42" cy="14.6" r="5.4" fill="rgba(255,255,255,.6)" stroke={INK} strokeWidth="2" /><path d="M38.2 18.6l-2 2" stroke={INK} strokeWidth="2.4" strokeLinecap="round" /></>,
  love: <><Heart x={33} y={8} s={1.7} c={ORANGE} /><Heart x={4} y={11} s={1.2} c={ORANGE} /><Heart x={40} y={20} s={0.9} c="#ff7a59" /></>,
  sleepy: <><Word t="z" x={31} y={13} size={9} c="#4c6fd1" /><Word t="z" x={36} y={7} size={7} c="#4c6fd1" /><Word t="z" x={40} y={2} size={5} c="#4c6fd1" /></>,
};

// pose name -> eyes, mouth, arms, extra, blush
export const LANTERN_POSES = {
  hello: { eyes: 'open', mouth: 'smile', arms: 'wave', extra: 'wave', cheeks: true },
  pointing: { eyes: 'open', mouth: 'smirk', arms: 'point', extra: 'point' },
  thinking: { eyes: 'think', mouth: 'wiggle', arms: 'think', extra: 'think' },
  celebrate: { eyes: 'happy', mouth: 'grin', arms: 'up', extra: 'party', cheeks: true },
  wink: { eyes: 'wink', mouth: 'smile', arms: 'down', extra: 'wink' },
  oops: { eyes: 'wide', mouth: 'o', arms: 'down', extra: 'oops' },
  looking: { eyes: 'look', mouth: 'flat', arms: 'glass', extra: 'look' },
  love: { eyes: 'love', mouth: 'smile', arms: 'down', extra: 'love', cheeks: true },
  sleepy: { eyes: 'sleepy', mouth: 'flat', arms: 'down', extra: 'sleepy' },
};

const Body = () => (
  <>
    <path d="M14 9c0-4 2-6 6-6s6 2 6 6" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
    <rect x="11" y="8" width="18" height="5" rx="2" fill={INK} />
    <path d="M10 14h20l3 20c.5 4-2.5 8-6 8H13c-3.5 0-6.5-4-6-8z" fill={BUTTER} stroke={INK} strokeWidth="2.5" />
  </>
);

export default function Lantern({ size = 38, pose }) {
  const spec = pose ? LANTERN_POSES[pose] : null;
  if (!spec) {
    return (
      <svg className="tour-lantern" viewBox="0 0 40 48" width={size} height={Math.round(size * 1.2)} aria-hidden="true" focusable="false">
        <Body />
        <circle cx="16" cy="27" r="2" fill={INK} />
        <circle cx="24" cy="27" r="2" fill={INK} />
        <path d="M16 32q4 3 8 0" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
        <rect x="12" y="42" width="16" height="4" rx="2" fill={INK} />
      </svg>
    );
  }
  // The pose picture is wider and taller (room for arms and props), drawn at the same scale as the plain lantern.
  const scale = size / 40;
  return (
    <svg className="tour-lantern" viewBox="-10 -6 60 54" width={Math.round(60 * scale)} height={Math.round(54 * scale)} aria-hidden="true" focusable="false">
      {ARMS[spec.arms]}
      <Body />
      {spec.cheeks && <><circle cx="12" cy="31.4" r="2.1" fill="#ff8a65" opacity=".6" /><circle cx="28" cy="31.4" r="2.1" fill="#ff8a65" opacity=".6" /></>}
      {EYES[spec.eyes]}
      {MOUTH[spec.mouth]}
      <rect x="12" y="42" width="16" height="4" rx="2" fill={INK} />
      {EXTRA[spec.extra]}
    </svg>
  );
}
