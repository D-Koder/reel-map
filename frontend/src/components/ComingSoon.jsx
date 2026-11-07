import React from 'react';
import { CalendarCheck, Flame, MapPin, Share2 } from 'lucide-react';
import '../App.css';

// Shown instead of the app on the public domain until launch. Nothing here talks to the database.
const TEASERS = [
  { icon: Share2, title: 'Save a reel', text: 'Share it from Instagram and the place lands on your map.', tint: 'var(--butter)' },
  { icon: Flame, title: 'Vote together', text: 'Are you both keen? Find out before the group chat goes quiet.', tint: 'var(--accent-soft)' },
  { icon: CalendarCheck, title: 'Plan it for real', text: 'Pick a time, get a nudge, and actually go.', tint: 'var(--mint)' },
  { icon: MapPin, title: 'See it all on a map', text: 'Every saved spot in one place, near you or not.', tint: 'var(--lilac)' },
];

export default function ComingSoon() {
  return (
    <main className="soon">
      <div className="soon-inner">
        <div className="soon-brand">
          waylit maps<span className="wordmark-dot" aria-hidden="true">.</span>
        </div>
        <span className="soon-badge">Coming soon</span>
        <h1 className="soon-title">Turn saved reels into plans you actually make.</h1>
        <p className="soon-lead">
          Something good is being built for couples and friends who send each other places all week and never go.
        </p>
        <ul className="soon-list">
          {TEASERS.map(({ icon: Icon, title, text, tint }) => (
            <li key={title} className="soon-card">
              <span className="soon-icon" style={{ background: tint }}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <div>
                <h2 className="soon-card-title">{title}</h2>
                <p className="soon-card-text">{text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="soon-foot">Not open yet. Check back soon.</p>
      </div>
    </main>
  );
}
