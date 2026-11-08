import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { readJSON, writeJSON } from '../lib/storage';

const key = (userId) => `reelmap:welcome-done:${userId}`;

// A 3-step checklist for new people. Each step ticks itself off; the card goes once all 3 are done or it's closed.
export default function WelcomeSteps({ userId, places, collections, onInvite }) {
  const [closed, setClosed] = useState(() => readJSON(key(userId), false));
  const saved = places.length > 0;
  const invited = collections.some((c) => c.members.length > 1);
  const voted = places.some((p) => p.reactions?.[userId]);
  if (closed || (saved && invited && voted)) return null;

  const close = () => { writeJSON(key(userId), true); setClosed(true); };
  const steps = [
    { done: saved, title: 'Save your first reel', hint: 'Copy a reel link, then tap "Paste a reel link" below.' },
    { done: invited, title: 'Invite your partner', hint: 'Plans are better with two.', action: collections.length ? { label: 'Invite', run: onInvite } : null },
    { done: voted, title: 'Vote on a place', hint: 'Open a saved place and tap how keen you are.' },
  ];

  return (
    <section className="welcome" aria-label="Getting started">
      <div className="welcome-head">
        <strong>Get started</strong>
        <button type="button" className="inbox-dismiss" onClick={close} aria-label="Hide getting started">
          <X aria-hidden="true" />
        </button>
      </div>
      <ol className="welcome-list">
        {steps.map((s) => (
          <li key={s.title} className={`welcome-step ${s.done ? 'done' : ''}`}>
            <span className="welcome-tick" aria-hidden="true">{s.done && <Check size={14} />}</span>
            <div className="welcome-text">
              <div className="welcome-title">{s.title}{s.done && <span className="sr-only"> (done)</span>}</div>
              {!s.done && <div className="welcome-hint">{s.hint}</div>}
            </div>
            {!s.done && s.action && <button type="button" className="inbox-action" onClick={s.action.run}>{s.action.label}</button>}
          </li>
        ))}
      </ol>
    </section>
  );
}
