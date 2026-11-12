// Patterns that sit inside a collection's pin colour. Plain colours are free. Three textures come with the Explorer badge,
// the rest are level prizes (see levels.js). `unlock` is a badge id or a prize level.
// Each is drawn on a 16 x 16 tile in white, then faded so the letter on the pin stays the loudest thing.

export const PATTERN_OPACITY = 0.2;

export const PIN_PATTERNS = [
  { id: 'cat', name: 'Cat faces', group: 'Cute', unlock: { badge: 'explorer' }, svg: '<path fill-rule="evenodd" d="M1.500 8L2.500 1l4 3h3l4-3 1 7c0 4-3 6.500-6.500 6.500S1.500 12 1.500 8zM4.800 8.700a1 1 0 1 0 2 0 1 1 0 1 0-2 0zM9.200 8.700a1 1 0 1 0 2 0 1 1 0 1 0-2 0z"/>' },
  { id: 'heart', name: 'Hearts', group: 'Cute', unlock: { badge: 'explorer' }, svg: '<path d="M8 13.500S2 9.800 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 3.800-6 7.500-6 7.500z"/>' },
  { id: 'flower', name: 'Flowers', group: 'Cute', unlock: { prize: 2 }, svg: '<circle cx="8" cy="3.600" r="2.300"/><circle cx="12.200" cy="6.700" r="2.300"/><circle cx="10.600" cy="11.600" r="2.300"/><circle cx="5.400" cy="11.600" r="2.300"/><circle cx="3.800" cy="6.700" r="2.300"/><circle cx="8" cy="8" r="2"/>' },
  { id: 'star', name: 'Stars', group: 'Cool', unlock: { prize: 5 }, svg: '<path d="M8 1.500l1.900 4 4.300.6-3.100 3 .8 4.300L8 11.300 4.100 13.400l.8-4.300-3.100-3 4.300-.6z"/>' },
  { id: 'leaf', name: 'Leaves', group: 'Neutral', unlock: { badge: 'explorer' }, svg: '<path d="M3 13c0-6 4-9 10-9 0 6-4 10-9 9M3 13l6-6" fill="none" stroke="#fff" stroke-width="1.600" stroke-linecap="round"/>' },
  { id: 'wave', name: 'Waves', group: 'Neutral', unlock: { prize: 5 }, svg: '<path d="M0 6q2-3 4 0t4 0 4 0 4 0M0 12q2-3 4 0t4 0 4 0 4 0" fill="none" stroke="#fff" stroke-width="1.800" stroke-linecap="round"/>' },
  { id: 'cloud', name: 'Clouds', group: 'Cute', unlock: { prize: 7 }, svg: '<path d="M4 13a3 3 0 0 1 .4-6A4.300 4.300 0 0 1 12.300 7.600 2.700 2.700 0 0 1 12 13z"/>' },
  { id: 'dots', name: 'Dots', group: 'Neutral', unlock: { prize: 7 }, svg: '<circle cx="4" cy="4" r="2"/><circle cx="12" cy="12" r="2"/>' },
  { id: 'bolt', name: 'Lightning', group: 'Cool', unlock: { prize: 13 }, svg: '<path d="M9.500 1L3 9h4.200L6 15l7-8.500H8.800z"/>' },
  { id: 'moon', name: 'Moons', group: 'Cool', unlock: { prize: 13 }, svg: '<path d="M10 1.500a6.500 6.500 0 1 0 4.500 10 5.500 5.500 0 0 1-4.500-10z"/>' },
  { id: 'flame', name: 'Flames', group: 'Cool', unlock: { prize: 13 }, svg: '<path d="M8 0.800C8.200 3.500 4 5 4 9.800a4 4 0 0 0 8 0c0-1.800-.8-3-1.800-3.900-.1 1.400-.7 2.200-1.500 2.400C9.600 6.200 9.300 3 8 .8zM8 14a2 2 0 0 1-2-2c0-1.200 1-2 2-3.200 1 1.200 2 2 2 3.200a2 2 0 0 1-2 2z" fill-rule="evenodd"/>' },
  { id: 'diamond', name: 'Diamonds', group: 'Cool', unlock: { prize: 20 }, svg: '<path d="M8 1l5 7-5 7-5-7z"/>' },
  { id: 'stripes', name: 'Stripes', group: 'Neutral', unlock: { prize: 20 }, svg: '<path d="M-2 14L14 -2M4 18L20 2M-8 8L8 -8" stroke="#fff" stroke-width="2.200" fill="none"/>' },
];

export const patternById = (id) => PIN_PATTERNS.find((p) => p.id === id) ?? null;

// A CSS background-image value that repeats the pattern, or null for an unknown id.
export function patternTile(id) {
  const pattern = patternById(id);
  if (!pattern) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><g fill="#fff" opacity="${PATTERN_OPACITY}">${pattern.svg}</g></svg>`;
  return `url('data:image/svg+xml;utf8,${encodeURIComponent(svg).replace(/'/g, '%27')}')`;
}

// A texture can be used when its badge is earned or its level prize claimed. `unlocked` holds badge ids and "prize:N" tokens.
export function patternUnlocked(pattern, unlocked) {
  const { badge, prize } = pattern.unlock ?? {};
  return badge ? unlocked.has(badge) : prize ? unlocked.has(`prize:${prize}`) : true;
}
