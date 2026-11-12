import { useCallback, useState } from 'react';
import { readJSON, writeJSON } from '../lib/storage';
import { patternById } from '../lib/pinPatterns';

// The colours a collection's pins can wear. Free for everyone. Each is dark enough for the white letter on top.
export const PIN_COLOURS = [
  { id: 'tomato', name: 'Tomato', hex: '#d4421d' },
  { id: 'pink', name: 'Pink', hex: '#e0336a' },
  { id: 'violet', name: 'Violet', hex: '#7c3aed' },
  { id: 'ocean', name: 'Ocean', hex: '#0ea5e9' },
  { id: 'forest', name: 'Forest', hex: '#15803d' },
  { id: 'ink', name: 'Ink', hex: '#1a1a18' },
];

const key = (userId) => `reelmap:pin-colours:${userId}`;

// Older saves held just a colour string per collection. Everything becomes { c: colour, p: pattern id or null }.
function tidy(saved) {
  const out = {};
  for (const [id, value] of Object.entries(saved ?? {})) {
    const entry = typeof value === 'string' ? { c: value, p: null } : value;
    if (entry?.c) out[id] = { c: entry.c, p: patternById(entry.p) ? entry.p : null };
  }
  return out;
}

// One colour (and, with Explorer, one pattern) per collection, chosen by me and kept on this device.
export default function usePinColours(userId) {
  const [map, setMap] = useState(() => tidy(readJSON(key(userId), {})));

  // patch is { c } and/or { p }. A pattern with no colour yet starts from the first colour. { c: null } clears both.
  const setPin = useCallback((collectionId, patch) => {
    setMap((current) => {
      const next = { ...current };
      const before = next[collectionId];
      if (patch.c === null) delete next[collectionId];
      else next[collectionId] = { c: patch.c ?? before?.c ?? PIN_COLOURS[0].hex, p: 'p' in patch ? patch.p : before?.p ?? null };
      writeJSON(key(userId), next);
      return next;
    });
  }, [userId]);

  return { map, setPin };
}
