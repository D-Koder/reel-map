import React from 'react';
import { Bell, X } from 'lucide-react';

export default function NotificationPanel({ open, onClose, notifications, onClear }) {
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
                {notifications.map((notif) => (
                  <div key={notif.id} className={`notification-item notification-${notif.type}`}>
                    <notif.icon className="notification-icon" aria-hidden="true" />
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
