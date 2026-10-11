import React from 'react';

const MESSAGES = {
  saving: 'Finding the place in this reel…',
  offline: "Saved. We'll find the place when you're back online.",
  'needs-place': "We couldn't tell which place this is yet.",
  failed: "Couldn't save this reel.",
};

// Reels shared into the app that are still being saved, or need the user to finish them.
export default function ReelInbox({ items, onFinish, onRetry, onDismiss }) {
  if (!items.length) return null;
  return (
    <div className="reel-inbox" aria-label="Shared reels">
      {items.map((item) => {
        const busy = item.status === 'saving';
        const finish = item.status === 'needs-place';
        return (
          <div key={item.id} className={`inbox-card ${item.status}`} role="status">
            <span className="inbox-thumb" aria-hidden="true">
              {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" /> : '🎬'}
            </span>
            <div className="inbox-info">
              {item.name && <div className="inbox-name">{item.name}</div>}
              <div className="inbox-message">
                {busy && <span className="spinner" aria-hidden="true" />}
                {MESSAGES[item.status]}
              </div>
            </div>
            {finish && (
              <button type="button" className="inbox-action" onClick={() => onFinish(item)}>
                Finish
              </button>
            )}
            {item.status === 'failed' && (
              <button type="button" className="inbox-action" onClick={() => onRetry(item)}>
                Retry
              </button>
            )}
            {!busy && (
              <button type="button" className="inbox-dismiss" onClick={() => onDismiss(item.id)} aria-label="Remove this reel">
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
