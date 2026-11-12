// Patterns that sit inside a collection's pin colour. Explorer unlocks them; plain colours are free.
// Each is drawn on a 16 x 16 tile in white, then faded so the letter on the pin stays the loudest thing.

export const PATTERN_OPACITY = 0.2;

export const PIN_PATTERNS = [
  { id: 'cat', name: 'Cat faces', group: 'Cute', svg: '<path fill-rule="evenodd" d="M1.500 8L2.500 1l4 3h3l4-3 1 7c0 4-3 6.500-6.500 6.500S1.500 12 1.500 8zM4.800 8.700a1 1 0 1 0 2 0 1 1 0 1 0-2 0zM9.200 8.700a1 1 0 1 0 2 0 1 1 0 1 0-2 0z"/>' },
  { id: 'heart', name: 'Hearts', group: 'Cute', svg: '<path d="M8 13.500S2 9.800 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 3.800-6 7.500-6 7.500z"/>' },
  { id: 'flower', name: 'Flowers', group: 'Cute', svg: '<circle cx="8" cy="3.600" r="2.300"/><circle cx="12.200" cy="6.700" r="2.300"/><circle cx="10.600" cy="11.600" r="2.300"/><circle cx="5.400" cy="11.600" r="2.300"/><circle cx="3.800" cy="6.700" r="2.300"/><circle cx="8" cy="8" r="2"/>' },
  { id: 'star', name: 'Stars', group: 'Cool', svg: '<path d="M8 1.500l1.900 4 4.300.6-3.100 3 .8 4.300L8 11.300 4.100 13.400l.8-4.300-3.100-3 4.300-.6z"/>' },
  { id: 'leaf', name: 'Leaves', group: 'Neutral', svg: '<path d="M3 13c0-6 4-9 10-9 0 6-4 10-9 9M3 13l6-6" fill="none" stroke="#fff" stroke-width="1.600" stroke-linecap="round"/>' },
  { id: 'wave', name: 'Waves', group: 'Neutral', svg: '<path d="M0 6q2-3 4 0t4 0 4 0 4 0M0 12q2-3 4 0t4 0 4 0 4 0" fill="none" stroke="#fff" stroke-width="1.800" stroke-linecap="round"/>' },
];

export const patternById = (id) => PIN_PATTERNS.find((p) => p.id === id) ?? null;

// A CSS background-image value that repeats the pattern, or null for an unknown id.
export function patternTile(id) {
  const pattern = patternById(id);
  if (!pattern) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><g fill="#fff" opacity="${PATTERN_OPACITY}">${pattern.svg}</g></svg>`;
  return `url('data:image/svg+xml;utf8,${encodeURIComponent(svg).replace(/'/g, '%27')}')`;
}
