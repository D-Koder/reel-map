import React, { useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';

// `canOpen(notif)` says whether a notification leads somewhere; tapping it calls `onOpen(notif)`.
// `onRemove(id)` deletes one notification: its ✕ sits inside the card (the item itself can be a button), or swipe it left.
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
                    </button>
                  ) : (
                    <div className={`notification-item notification-${notif.type}`}>{body}</div>
                  );
                  return (
                    <SwipeRow key={notif.id} onRemove={() => onRemove(notif.id)}>
                      {item}
                      <button type="button" className="notification-remove" onClick={() => onRemove(notif.id)} aria-label="Remove this notification">
                        <X aria-hidden="true" />
                      </button>
                    </SwipeRow>
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

// One notification: swipe it left to delete it (swiping right is left to the panel, which closes). It follows
// the finger; let go past a third of its width, or with a quick flick, and it slides out and is removed.
function SwipeRow({ onRemove, children }) {
  const rowRef = useRef(null);
  const removeRef = useRef(onRemove);
  removeRef.current = onRemove;
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
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
        sideways = x < 0 && Math.abs(x) > Math.abs(y);
        if (!sideways) { start = null; return; }
        row.style.transition = 'none';
      }
      event.preventDefault();
      dx = Math.min(0, x);
      row.style.transform = `translateX(${dx}px)`;
    };
    const onEnd = () => {
      if (!start) return;
      const flick = dx < -40 && Date.now() - start.at < 250;
      start = null;
      if (!sideways) return;
      row.style.transition = '';
      if (dx < -row.offsetWidth / 3 || flick) {
        row.style.transform = 'translateX(-110%)';
        row.style.opacity = '0';
        setTimeout(() => removeRef.current(), 180);
      } else {
        row.style.transform = '';
      }
    };
    row.addEventListener('touchstart', onStart, { passive: true });
    row.addEventListener('touchmove', onMove, { passive: false });
    row.addEventListener('touchend', onEnd);
    row.addEventListener('touchcancel', onEnd);
    return () => {
      row.removeEventListener('touchstart', onStart);
      row.removeEventListener('touchmove', onMove);
      row.removeEventListener('touchend', onEnd);
      row.removeEventListener('touchcancel', onEnd);
    };
  }, []);
  return <div ref={rowRef} className="notification-row">{children}</div>;
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
