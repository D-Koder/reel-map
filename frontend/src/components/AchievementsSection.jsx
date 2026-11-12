import React, { useState } from 'react';
import { Building2, Calendar, Camera, Clock, Compass, Flame, Gem, Globe, Heart, Hourglass, Leaf, Link, Lock, MapPin, Medal, MessageSquare, PlayCircle, Repeat, UtensilsCrossed, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import FramedAvatar from './FramedAvatar';
import { FRAMES, frameUnlocked, badgeById } from '../lib/achievements';

export const BADGE_ICONS = { Building2, Calendar, Camera, Clock, Compass, Flame, Gem, Globe, Heart, Hourglass, Leaf, Link, MapPin, MessageSquare, PlayCircle, Repeat, UtensilsCrossed, Zap };

// A stand-in picture so every frame can be previewed, even before it is earned.
function Swatch({ frame }) {
  return (
    <FramedAvatar frame={frame}>
      <span className="frame-swatch" aria-hidden="true" />
    </FramedAvatar>
  );
}

// Settings: the badges earned, the frame and title being worn, and what is still to do.
export default function AchievementsSection({ achievements }) {
  const [open, setOpen] = useState(false);
  const { badges, earnedIds, titles, frame, title, setFrame, setTitle } = achievements;
  const earned = badges.filter((b) => b.earned).length;
  if (!badges.length) return null;

  return (
    <div className="settings-section">
      <button type="button" className="settings-section-title settings-section-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Medal className="ico" aria-hidden="true" /> Achievements
        <span className="ach-count">{earned} of {badges.length}</span>
        {open ? <ChevronUp className="ico" aria-hidden="true" /> : <ChevronDown className="ico" aria-hidden="true" />}
      </button>

      {open && (
        <div className="ach">
          <h3 className="ach-heading">Profile frame</h3>
          <div className="ach-frames">
            <button type="button" className="ach-frame" aria-pressed={!frame} onClick={() => setFrame(null)}>
              <Swatch frame={null} />
              <span>None</span>
            </button>
            {FRAMES.map((f) => {
              const unlocked = frameUnlocked(f, earnedIds);
              return (
                <button key={f.id} type="button" className={`ach-frame${unlocked ? '' : ' locked'}`} aria-pressed={frame === f.id} disabled={!unlocked} onClick={() => setFrame(f.id)}>
                  <Swatch frame={f.id} />
                  <span>{f.name}</span>
                  <small>{unlocked ? (f.months ? 'In season' : 'Earned') : f.months ? f.season : <><Lock aria-hidden="true" /> {badgeById(f.badge).name}</>}</small>
                </button>
              );
            })}
          </div>

          <h3 className="ach-heading">Title</h3>
          <div className="ach-titles">
            {titles.map((t) => (
              <button key={t} type="button" className="ach-chip" aria-pressed={title === t} onClick={() => setTitle(t)}>{t}</button>
            ))}
          </div>

          <h3 className="ach-heading">Badges</h3>
          <ul className="ach-badges">
            {badges.map((b) => {
              const Icon = BADGE_ICONS[b.icon] ?? Medal;
              return (
                <li key={b.id} className={`ach-badge${b.earned ? ' earned' : ''}`}>
                  <span className="ach-badge-icon"><Icon aria-hidden="true" /></span>
                  <span className="ach-badge-text">
                    <strong>{b.name}</strong>
                    <small>{b.how}</small>
                    {!b.earned && !b.soon && (
                      <span className="ach-bar" role="progressbar" aria-valuemin={0} aria-valuemax={b.target} aria-valuenow={b.count} aria-label={`${b.name} progress`}>
                        <i style={{ width: `${(b.count / b.target) * 100}%` }} />
                      </span>
                    )}
                  </span>
                  <span className="ach-badge-state">{b.earned ? 'Earned' : b.soon ? 'Coming soon' : `${b.count} of ${b.target}`}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
