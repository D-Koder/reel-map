import React from 'react';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import Lantern from '../tour/Lantern';
import './Landing.css';

// What someone sees on the main page when they are not signed in: what Waylit does, a way to try it without an
// account, and the usual Sign up and Log in.
export default function Landing({ onTry, onSignUp, onLogin }) {
  return (
    <div className="landing">
      <div className="landing-col">
        <header className="landing-top">
          <span className="landing-brand">waylit maps<i>.</i></span>
          <button type="button" className="landing-login" onClick={onLogin}>Log in</button>
        </header>

        <section className="landing-hero">
          <Lantern size={52} pose="hello" />
          <h1>Turn reels into plans.</h1>
          <p>Save places from Instagram and TikTok, pick a time, and plan it with your people.</p>
        </section>

        <ul className="landing-benefits">
          <li><span className="landing-icon"><MapPin aria-hidden="true" /></span><div><b>Save from any reel</b><span>Paste a link and we find the place.</span></div></li>
          <li><span className="landing-icon"><CalendarDays aria-hidden="true" /></span><div><b>Pick a time and book</b><span>Your group gets a ping when it is booked.</span></div></li>
          <li><span className="landing-icon"><Users aria-hidden="true" /></span><div><b>Plan together</b><span>Vote on places and see who is keen.</span></div></li>
        </ul>

        <div className="landing-cta">
          <button type="button" className="step-btn primary full-width" onClick={onTry}>Try it now. No account.</button>
          <button type="button" className="step-btn secondary full-width" onClick={onSignUp}>Sign up</button>
        </div>

        <footer className="landing-foot">
          <a href="/privacy" target="_blank" rel="noreferrer">Privacy</a>
          <a href="/terms" target="_blank" rel="noreferrer">Terms</a>
          <a href="/support" target="_blank" rel="noreferrer">Help</a>
        </footer>
      </div>
    </div>
  );
}
