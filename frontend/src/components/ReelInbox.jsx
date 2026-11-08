import React, { useState } from 'react';
import { Check, Film, RefreshCw, X } from 'lucide-react';

const MESSAGES = {
  saving: 'Finding the place in this reel…',
  offline: "Saved. We'll find the place when you're back online.",
  'needs-place': "We couldn't tell which place this is. Tap Finish to pick it.",
  failed: "Couldn't save this reel.",
};

// A pasted post that lists several places: tick the ones to save. The list scrolls inside the card.
function ListConfirm({ item, onSave, onReject, onDismiss }) {
  const places = item.reelData.listedPlaces;
  const [picked, setPicked] = useState(() => new Set());
  const toggle = (line) => setPicked((now) => {
    const next = new Set(now);
    if (next.has(line)) next.delete(line); else next.add(line);
    return next;
  });
  const all = picked.size === places.length;

  return (
    <div className="inbox-card confirm-list" role="group" aria-label={`This post lists ${places.length} places`}>
      <div className="lc-head">
        <span className="inbox-thumb" aria-hidden="true"><Film aria-hidden="true" /></span>
        <div className="inbox-info">
          <div className="inbox-name">This post lists {places.length} places</div>
          <div className="inbox-message">Tick the ones to save.</div>
        </div>
        <button type="button" className="inbox-dismiss" onClick={() => onDismiss(item.id)} aria-label="Remove this reel">
          <X aria-hidden="true" />
        </button>
      </div>
      <ul className="lc-places">
        {places.map((place) => {
          const on = picked.has(place.line);
          return (
            <li key={place.line}>
              <button type="button" className="lc-place" aria-pressed={on} onClick={() => toggle(place.line)}>
                <span className="lc-box" aria-hidden="true">{on && <Check size={14} />}</span>
                <span className="lc-text">
                  <span className="lc-name">{place.name}</span>
                  {(place.address || place.area) && <span className="lc-addr">{place.address || place.area}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="inbox-confirm">
        <button type="button" className="inbox-action" disabled={!picked.size} onClick={() => onSave(item, [...picked])}>
          {picked.size ? `Save ${picked.size} selected` : 'Pick places to save'}
        </button>
      </div>
      <div className="inbox-confirm">
        <button type="button" className="inbox-action secondary" onClick={() => setPicked(all ? new Set() : new Set(places.map((p) => p.line)))}>
          {all ? 'Clear all' : 'Select all'}
        </button>
        <button type="button" className="inbox-action secondary" onClick={() => onReject(item)}>Wrong place</button>
      </div>
    </div>
  );
}

// Reels shared into the app that are still being saved, or need the user to finish them.
export default function ReelInbox({ items, onFinish, onRetry, onDismiss, onConfirm, onReject, onSaveListed }) {
  if (!items.length) return null;
  return (
    <div className="reel-inbox" aria-label="Shared reels">
      {items.map((item) => {
        if (item.status === 'confirm-list') {
          return <ListConfirm key={item.id} item={item} onSave={onSaveListed} onReject={onReject} onDismiss={onDismiss} />;
        }
        const busy = item.status === 'saving';
        const finish = item.status === 'needs-place';
        const confirming = item.status === 'confirm';
        return (
          <div key={item.id} className={`inbox-card ${item.status}`} role="status">
            <span className="inbox-thumb" aria-hidden="true">
              <Film aria-hidden="true" />
            </span>
            <div className="inbox-info">
              {item.name && <div className="inbox-name">{item.name}</div>}
              <div className="inbox-message">
                {busy && <span className="spinner" aria-hidden="true" />}
                {confirming ? (item.address || 'Is this the right place?') : busy && item.progress ? `Saving ${item.progress}…` : busy && item.name ? 'Found it! Saving…' : MESSAGES[item.status]}
              </div>
            </div>
            {confirming && (
              <div className="inbox-confirm">
                <button type="button" className="inbox-action" onClick={() => onConfirm(item)}>Save</button>
                <button type="button" className="inbox-action secondary" onClick={() => onReject(item)}>Wrong place</button>
              </div>
            )}
            {finish && (
              <button type="button" className="inbox-action" onClick={() => onFinish(item)}>
                Finish
              </button>
            )}
            {/* The lookup can fail for a passing reason (Google or the server), so it can run again. */}
            {finish && (
              <button type="button" className="inbox-dismiss" onClick={() => onRetry(item)} aria-label="Look up this reel again">
                <RefreshCw aria-hidden="true" />
              </button>
            )}
            {item.status === 'failed' && (
              <button type="button" className="inbox-action" onClick={() => onRetry(item)}>
                Retry
              </button>
            )}
            {/* A lookup running here can be cancelled. One the server is saving (from the Shortcut) can't. */}
            {(!busy || !item.remote) && (
              <button type="button" className="inbox-dismiss" onClick={() => onDismiss(item.id)} aria-label={busy ? 'Cancel this import' : 'Remove this reel'}>
                <X aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
