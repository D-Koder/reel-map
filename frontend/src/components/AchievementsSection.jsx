import React, { useState } from 'react';
import { Building2, Calendar, Camera, Clock, Compass, Flame, Gem, Globe, Heart, Hourglass, Leaf, Link, Lock, MapPin, Medal, MessageSquare, PlayCircle, Repeat, UtensilsCrossed, Zap, ChevronDown, ChevronRight, ChevronUp, Frame } from 'lucide-react';
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
export default function AchievementsSection({ achievements, onOpenAchievements }) {
  const [open, setOpen] = useState(false);
  const { badges, earnedIds, titles, ladders, fun, frame, title, setFrame, setTitle } = achievements;
  // Titles that come with a badge and are not part of a ladder or a fun one.
  const ladderNames = new Set([...ladders.flatMap((l) => l.tiers.map((t) => t.title)), ...fun.map((f) => f.title)]);
  const badgeTitles = titles.filter((t) => !ladderNames.has(t));
  const earned = badges.filter((b) => b.earned).length;
  if (!badges.length) return null;

  return (
    <div className="settings-section">
      {onOpenAchievements && (
        <button type="button" className="settings-section-title settings-section-toggle ach-open" onClick={onOpenAchievements}>
          <Medal className="ico" aria-hidden="true" /> Achievements
          <span className="ach-count">Level {achievements.level.level}{achievements.readyBadges.length + achievements.prizes.filter((p) => p.state === 'ready').length > 0 ? ' · rewards ready!' : ''}</span>
          <ChevronRight className="ico" aria-hidden="true" />
        </button>
      )}
      <button type="button" className="settings-section-title settings-section-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Frame className="ico" aria-hidden="true" /> Customise profile
        <span className="ach-count">{earned} of {badges.length} badges</span>
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
          <p className="ach-note">Shows under your name. Tap one you have earned.</p>
          {ladders.map((l) => (
            <div key={l.id} className="ach-ladder">
              <div className="ach-ladder-head">
                <strong>{l.name}</strong>
                <small>{l.soon ? 'Coming soon' : `${l.count} ${l.unit}`}</small>
              </div>
              <div className="ach-titles">
                {l.tiers.map((t) => (t.earned
                  ? <button key={t.title} type="button" className="ach-chip" aria-pressed={title === t.title} onClick={() => setTitle(t.title)}>{t.title}</button>
                  : <span key={t.title} className="ach-chip locked" title={l.soon ? 'Coming soon' : `${t.at} ${l.unit}`}><Lock aria-hidden="true" /> {t.title} <small>{t.at}</small></span>
                ))}
              </div>
              {!l.soon && l.next && (
                <p className="ach-next">{l.next.at - l.count} more to reach {l.next.title}</p>
              )}
            </div>
          ))}
          <div className="ach-ladder">
            <div className="ach-ladder-head"><strong>Fun titles</strong></div>
            <div className="ach-titles">
              {fun.map((f) => (f.earned
                ? <button key={f.title} type="button" className="ach-chip" aria-pressed={title === f.title} onClick={() => setTitle(f.title)}>{f.title}</button>
                : <span key={f.title} className="ach-chip locked" title={f.soon ? 'Coming soon' : f.how}><Lock aria-hidden="true" /> {f.title}</span>
              ))}
            </div>
          </div>
          {badgeTitles.length > 0 && (
            <div className="ach-ladder">
              <div className="ach-ladder-head"><strong>From badges</strong></div>
              <div className="ach-titles">
                {badgeTitles.map((t) => (
                  <button key={t} type="button" className="ach-chip" aria-pressed={title === t} onClick={() => setTitle(t)}>{t}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
