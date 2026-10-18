import React, { useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';

// `canOpen(notif)` says whether a notification leads somewhere; tapping it calls `onOpen(notif)`.
// `onRemove(id)` deletes one notification (its ✕ sits beside it, since the item itself can be a button).
export default function NotificationPanel({ open, onClose, notifications, onClear, onRemove, canOpen = () => false, onOpen }) {
  const panelRef = useRef(null);
  useSwipeRight(panelRef, onClose);
  return (
    <>
      <div className={`overlay-bg ${open ? 'open' : ''}`} onClick={onClose} />
      <div ref={panelRef} className={`notification-panel ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="notification-header">
          <span>Notifications</span>
          <button className="notification-close" onClick={onClose} aria-label="Close notifications">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="notification-content">
          {notifications.length === 0 ? (
            <div className="notification-empty">
              <Bell className="notification-empty-icon" aria-hidden="true" />
              <span className="notification-empty-text">No notifications yet</span>
            </div>
          ) : (
            <>
              <div className="notification-list">
                {notifications.map((notif) => {
                  const body = (
                    <>
                      <notif.icon className="notification-icon" aria-hidden="true" />
                      <div className="notification-info">
                        <div className="notification-message">{notif.message}</div>
                        <div className="notification-time">{notif.time}</div>
                      </div>
                    </>
                  );
                  const item = canOpen(notif) ? (
                    <button
                      type="button"
                      className={`notification-item notification-${notif.type} notification-link`}
                      onClick={() => onOpen(notif)}
                    >
                      {body}
                      <span className="notification-go" aria-hidden="true">›</span>
                    </button>
                  ) : (
                    <div className={`notification-item notification-${notif.type}`}>{body}</div>
                  );
                  return (
                    <div key={notif.id} className="notification-row">
                      {item}
                      <button type="button" className="notification-remove" onClick={() => onRemove(notif.id)} aria-label="Remove this notification">
                        <X aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
              {notifications.length > 0 && (
                <button className="notification-clear-btn" onClick={onClear}>
                  Clear all
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// The panel slides in from the right, so swiping it back to the right closes it. It follows the finger;
// let go past a third of its width (or with a quick flick) and it closes, otherwise it springs back.
// A mostly up-and-down swipe is left alone so the list still scrolls.
function useSwipeRight(panelRef, onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    let start = null;
    let sideways = null;
    let dx = 0;
    const onStart = (event) => {
      if (event.touches.length !== 1) return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY, at: Date.now() };
      sideways = null;
      dx = 0;
    };
    const onMove = (event) => {
      if (!start) return;
      const x = event.touches[0].clientX - start.x;
      const y = event.touches[0].clientY - start.y;
      if (sideways === null) {
        if (Math.abs(x) < 8 && Math.abs(y) < 8) return;
        sideways = Math.abs(x) > Math.abs(y);
        if (!sideways) { start = null; return; }
        panel.style.transition = 'none';
      }
      event.preventDefault();
      dx = Math.max(0, x);
      panel.style.transform = dx ? `translateX(${dx}px)` : '';
    };
    const onEnd = () => {
      if (!start) return;
      const flick = dx > 40 && Date.now() - start.at < 250;
      start = null;
      if (!sideways) return;
      panel.style.transition = '';
      if (dx > panel.offsetWidth / 3 || flick) {
        // Carry on sliding out from where the finger let go, then hand back to the closed style.
        panel.style.transform = 'translateX(100%)';
        closeRef.current();
        setTimeout(() => { panel.style.transform = ''; }, 300);
      } else {
        panel.style.transform = '';
      }
    };
    panel.addEventListener('touchstart', onStart, { passive: true });
    panel.addEventListener('touchmove', onMove, { passive: false });
    panel.addEventListener('touchend', onEnd);
    panel.addEventListener('touchcancel', onEnd);
    return () => {
      panel.removeEventListener('touchstart', onStart);
      panel.removeEventListener('touchmove', onMove);
      panel.removeEventListener('touchend', onEnd);
      panel.removeEventListener('touchcancel', onEnd);
    };
  }, [panelRef]);
}
