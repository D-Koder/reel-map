import React from 'react';

export default function NotificationPanel({ open, onClose, notifications, onClear }) {
  return (
    <>
      <div className={`overlay-bg ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`notification-panel ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="notification-header">
          <span>Notifications</span>
          <button className="notification-close" onClick={onClose} aria-label="Close notifications">
            ✕
          </button>
        </div>

        <div className="notification-content">
          {notifications.length === 0 ? (
            <div className="notification-empty">
              <span className="notification-empty-icon">🔔</span>
              <span className="notification-empty-text">No notifications yet</span>
            </div>
          ) : (
            <>
              <div className="notification-list">
                {notifications.map((notif) => (
                  <div key={notif.id} className={`notification-item notification-${notif.type}`}>
                    <span className="notification-icon">{notif.icon}</span>
                    <div className="notification-info">
                      <div className="notification-message">{notif.message}</div>
                      <div className="notification-time">{notif.time}</div>
                    </div>
                  </div>
                ))}
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
