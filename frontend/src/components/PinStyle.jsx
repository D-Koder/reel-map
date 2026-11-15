import React from 'react';
import { Lock } from 'lucide-react';
import { PIN_COLOURS } from '../hooks/usePinColours';
import { PIN_PATTERNS, patternTile, patternUnlocked } from '../lib/pinPatterns';

// The pin colour and texture for one collection, shown in that collection's own settings (the gear on its row).
// pin: { c, p } or undefined. onPin(patch) saves a change. unlocked: what the person has earned, for the textures.
export default function PinStyle({ collection, pin, onPin, unlocked }) {
  return (
    <div className="share-section">
      <div className="share-section-title">Map pins</div>
      <div className="pin-colours" role="group" aria-label={`Pin colour for ${collection.name}`}>
        <span className="pin-colours-label">Colour</span>
        <button type="button" className="pin-swatch pin-swatch-none" aria-pressed={!pin?.c} aria-label="Group colours (default)" title="Group colours (default)" onClick={() => onPin({ c: null })} />
        {PIN_COLOURS.map((c) => (
          <button key={c.id} type="button" className="pin-swatch" style={{ background: c.hex }} aria-pressed={pin?.c === c.hex} aria-label={c.name} title={c.name} onClick={() => onPin({ c: c.hex })} />
        ))}
      </div>
      <div className="pin-colours" role="group" aria-label={`Pin pattern for ${collection.name}`}>
        <span className="pin-colours-label">Pattern</span>
        <button type="button" className="pin-swatch pin-pattern" style={{ background: pin?.c ?? 'var(--surface-hover)' }} aria-pressed={!pin?.p} aria-label="No pattern" title="No pattern" onClick={() => onPin({ p: null })} />
        {PIN_PATTERNS.map((p) => {
          const open = unlocked ? patternUnlocked(p, unlocked) : false;
          return (
            <button key={p.id} type="button" className={`pin-swatch pin-pattern${open ? '' : ' pin-pattern-locked'}`} style={{ background: pin?.c ?? '#d4421d', backgroundImage: `${patternTile(p.id)}, ${patternTile(p.id)}` }} aria-pressed={pin?.p === p.id} aria-label={open ? p.name : `${p.name}, locked`} disabled={!open} title={open ? p.name : `${p.name}: ${p.unlock.badge ? 'earn the Explorer badge' : `reach Level ${p.unlock.prize} and claim the prize`}`} onClick={() => onPin({ p: p.id })}>
              {!open && <Lock aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
