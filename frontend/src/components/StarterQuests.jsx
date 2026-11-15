import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { readJSON, writeJSON } from '../lib/storage';

const hiddenKey = (userId) => `reelmap:quests-hidden:${userId}`;

// What to tap for the quests that open something. The others are explained in words.
const ACTIONS = {
  name: 'settings', customise: 'settings', notifications: 'settings', shortcut: 'settings', invite: 'invite',
};

// The starter quests card on Home: the next few things to learn, each with its XP. It replaces the old 3-step card.
// It goes away once every quest is done, or when closed.
export default function StarterQuests({ userId, quests, onOpenSettings, onInvite }) {
  const [hidden, setHidden] = useState(() => readJSON(hiddenKey(userId), false));
  const [all, setAll] = useState(false);
  if (!quests || hidden || quests.complete) return null;

  const close = () => { writeJSON(hiddenKey(userId), true); setHidden(true); };
  const list = all ? quests.list : quests.list.filter((q) => !q.done).slice(0, 3);
  const act = (q) => (ACTIONS[q.id] === 'invite' ? onInvite : ACTIONS[q.id] === 'settings' ? onOpenSettings : null);

  return (
    <section className="welcome quests" aria-label="Starter quests">
      <div className="welcome-head">
        <strong>Starter quests</strong>
        <span className="quest-count">{quests.done} of {quests.total} · {quests.xp} XP</span>
        <button type="button" className="inbox-dismiss" onClick={close} aria-label="Hide starter quests">
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="quest-bar" role="progressbar" aria-valuemin={0} aria-valuemax={quests.totalXp} aria-valuenow={quests.xp} aria-label="Starter quest XP"><i style={{ width: `${Math.round((quests.xp / quests.totalXp) * 100)}%` }} /></div>
      <ol className="welcome-list">
        {list.map((q) => {
          const run = !q.done && act(q);
          return (
            <li key={q.id} className={`welcome-step ${q.done ? 'done' : ''}`}>
              <span className="welcome-tick" aria-hidden="true">{q.done && <Check size={14} />}</span>
              <div className="welcome-text">
                <div className="welcome-title">{q.title}{q.done && <span className="sr-only"> (done)</span>}</div>
                {!q.done && <div className="welcome-hint">{q.how}</div>}
              </div>
              <span className="quest-xp">+{q.xp}</span>
              {run && <button type="button" className="inbox-action" onClick={run}>{ACTIONS[q.id] === 'invite' ? 'Invite' : 'Open'}</button>}
            </li>
          );
        })}
      </ol>
      <button type="button" className="quest-toggle" onClick={() => setAll((v) => !v)}>{all ? 'Show next up' : 'See all quests'}</button>
    </section>
  );
}
