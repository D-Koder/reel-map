import { useCallback, useState } from 'react';
import { readJSON, writeJSON } from '../lib/storage';

// The colours a collection's pins can wear. Each is dark enough for the white icon on top of it.
export const PIN_COLOURS = [
  { id: 'tomato', name: 'Tomato', hex: '#d4421d' },
  { id: 'pink', name: 'Pink', hex: '#e0336a' },
  { id: 'violet', name: 'Violet', hex: '#7c3aed' },
  { id: 'ocean', name: 'Ocean', hex: '#0ea5e9' },
  { id: 'forest', name: 'Forest', hex: '#15803d' },
  { id: 'ink', name: 'Ink', hex: '#1a1a18' },
];

const key = (userId) => `reelmap:pin-colours:${userId}`;

// One colour per collection, chosen by me and kept on this device. { "<collection id>": "#hex" }.
export default function usePinColours(userId) {
  const [map, setMap] = useState(() => readJSON(key(userId), {}));

  const setColour = useCallback((collectionId, hex) => {
    setMap((current) => {
      const next = { ...current };
      if (hex) next[collectionId] = hex;
      else delete next[collectionId];
      writeJSON(key(userId), next);
      return next;
    });
  }, [userId]);

  return { map, setColour };
}
