import React from 'react';
import { Bell, X } from 'lucide-react';

// `canOpen(notif)` says whether a notification leads somewhere; tapping it calls `onOpen(notif)`.
export default function NotificationPanel({ open, onClose, notifications, onClear, canOpen = () => false, onOpen }) {
  return (
    <>
      <div className={`overlay-bg ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`notification-panel ${open ? 'open' : ''}`} aria-hidden={!open}>
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
                  return canOpen(notif) ? (
                    <button
                      key={notif.id}
                      type="button"
                      className={`notification-item notification-${notif.type} notification-link`}
                      onClick={() => onOpen(notif)}
                    >
                      {body}
                      <span className="notification-go" aria-hidden="true">›</span>
                    </button>
                  ) : (
                    <div key={notif.id} className={`notification-item notification-${notif.type}`}>{body}</div>
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
