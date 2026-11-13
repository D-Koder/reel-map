import React from 'react';
import { Bell, House, Map as MapIcon, Plus, SlidersHorizontal } from 'lucide-react';

// The top bar and the bottom tab bar of the signed-in app. The no-login demo draws these same two pieces.
export function AppHeader({ unreadCount = 0, bellRinging = false, onBell, onGear }) {
  return (
    <header className="header">
      <span className="header-title">waylit maps<span className="wordmark-dot" aria-hidden="true">.</span></span>
      <div className="header-buttons">
        <button className={`header-btn${bellRinging ? ' bell-ringing' : ''}`} data-tour="bell" onClick={onBell} aria-label="Notifications">
          <Bell aria-hidden="true" />
          {unreadCount > 0 && (
            <span key={unreadCount} className="bell-count" style={{ marginLeft: 2, fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--accent)', borderRadius: 'var(--radius-pill)', padding: '0 5px' }}>
              {unreadCount}
            </span>
          )}
        </button>
        <button className="header-btn" data-tour="gear" onClick={onGear} aria-label="Settings">
          <SlidersHorizontal aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

export function BottomNav({ screen, onScreen, onAdd, addDisabled = false }) {
  return (
    <nav className="bottom-nav">
      {[
        { id: 'home', Icon: House, label: 'Home' },
        { id: 'add' },
        { id: 'map', Icon: MapIcon, label: 'Map' },
      ].map((tab) =>
        tab.id === 'add' ? (
          <button key="add" className="fab fab-nav" onClick={onAdd} disabled={addDisabled} aria-label="Add a place">
            <Plus aria-hidden="true" strokeWidth={2.5} />
          </button>
        ) : (
          <button
            key={tab.id}
            data-tour={tab.id === 'map' ? 'map-tab' : undefined}
            className={`nav-tab ${screen === tab.id ? 'active' : ''}`}
            onClick={() => onScreen(tab.id)}
            aria-current={screen === tab.id ? 'page' : undefined}
          >
            <tab.Icon className="nav-icon" aria-hidden="true" strokeWidth={screen === tab.id ? 2.4 : 1.8} />
            <span className="nav-label">{tab.label}</span>
          </button>
        )
      )}
    </nav>
  );
}
