import React, { useState } from 'react';
import { CalendarCheck, Flame, MapPin, Share2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import '../App.css';

// Shown instead of the app on the public domain until launch. The only thing it does is add an email to the waitlist.
const TEASERS = [
  { icon: Share2, title: 'Save a reel', text: 'Share it from Instagram and the place lands on your map.', tint: 'var(--butter)' },
  { icon: Flame, title: 'Vote together', text: 'Are you both keen? Find out before the group chat goes quiet.', tint: 'var(--accent-soft)' },
  { icon: CalendarCheck, title: 'Plan it for real', text: 'Pick a time, get a nudge, and actually go.', tint: 'var(--mint)' },
  { icon: MapPin, title: 'See it all on a map', text: 'Every saved spot in one place, near you or not.', tint: 'var(--lilac)' },
];

function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | error

  async function submit(e) {
    e.preventDefault();
    if (state === 'sending' || !supabase) return setState('error');
    setState('sending');
    const { error } = await supabase.rpc('join_waitlist', { p_email: email });
    setState(error ? 'error' : 'done');
  }

  if (state === 'done') return <p className="soon-done" role="status">You're on the list. We'll email you when it opens. 🎉</p>;
  return (
    <form className="soon-form" onSubmit={submit}>
      <label className="soon-label" htmlFor="waitlist-email">Get told when it opens</label>
      <div className="soon-row">
        <input
          id="waitlist-email"
          className="soon-input"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@email.com"
          required
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state === 'error') setState('idle'); }}
        />
        <button className="soon-btn" type="submit" disabled={state === 'sending'}>{state === 'sending' ? '...' : 'Join'}</button>
      </div>
      {state === 'error' && <p className="soon-error" role="alert">That didn't work. Check the email and try again.</p>}
    </form>
  );
}

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
        <WaitlistForm />
        <p className="soon-foot">Not open yet. We'll only email you about the launch.</p>
      </div>
    </main>
  );
}
