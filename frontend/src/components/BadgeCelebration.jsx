import React, { useEffect } from 'react';
import { Frame, Medal, Sparkles } from 'lucide-react';
import { BADGE_ICONS } from './AchievementsSection';
import { frameById } from '../lib/achievements';

const CONFETTI = ['✨', '🎉', '⭐', '🧡', '🎊'];

// Shown when a badge is earned. Spontaneous gets a lightning look and Finally! a warm "worth the wait" look.
export default function BadgeCelebration({ badge, onClose, onWear }) {
  useEffect(() => {
    navigator.vibrate?.([30, 60, 30]);
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const Icon = BADGE_ICONS[badge.icon] ?? Medal;
  const frame = badge.frame ? frameById(badge.frame) : null;
  const variant = badge.id === 'spontaneous' ? 'bolt' : badge.id === 'finally' ? 'years' : 'plain';
  const headline = { bolt: 'Spontaneous!', years: 'Finally!', plain: badge.name }[variant];
  const line = { bolt: 'Saved and visited within a day. That is the spirit.', years: 'You saved it a long time ago, and you made it.', plain: badge.how }[variant];

  return (
    <div className={`celebrate-overlay badge-celebrate ${variant}`} onClick={onClose}>
      {variant === 'bolt' && <div className="badge-flash" aria-hidden="true" />}
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} style={{ '--i': i, left: `${(i * 37) % 100}%` }}>{CONFETTI[i % CONFETTI.length]}</span>
        ))}
      </div>
      <div className="celebrate-card badge-card" role="dialog" aria-modal="true" aria-labelledby="badge-title" onClick={(event) => event.stopPropagation()}>
        <div className="badge-eyebrow">{variant === 'plain' ? 'New badge' : badge.name}</div>
        <div className="badge-big"><Icon aria-hidden="true" /></div>
        <div className="celebrate-title" id="badge-title">{headline}</div>
        <p className="celebrate-text">{line}</p>
        <ul className="badge-unlocks">
          {frame && <li><Frame aria-hidden="true" /> Frame: {frame.name}</li>}
          {badge.title && <li><Medal aria-hidden="true" /> Title: {badge.title}</li>}
          {badge.reward && <li><Sparkles aria-hidden="true" /> {badge.rewardBuilt ? badge.reward : `Coming soon: ${badge.reward}`}</li>}
        </ul>
        <div className="badge-actions">
          {frame && <button type="button" className="step-btn secondary" onClick={() => onWear(badge)}>Wear it now</button>}
          <button type="button" className="step-btn primary" autoFocus onClick={onClose}>Nice!</button>
        </div>
      </div>
    </div>
  );
}
