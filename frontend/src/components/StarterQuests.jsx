import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronRight, X } from 'lucide-react';
import useSheetDrag from '../lib/useSheetDrag';
import { questReward } from '../lib/quests';

// The details of one quest: its name, the steps to do it, and the reward. Nothing here opens the place for them: the
// person goes and finds it, and the quest ticks by itself when the app sees it done.
export function QuestSheet({ quest, totalXp, onClose }) {
  const sheetRef = useRef(null);
  const drag = useSheetDrag(sheetRef, onClose);
  const reward = questReward(quest, quest.done, totalXp);

  useEffect(() => {
    sheetRef.current?.focus();
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Drawn on the page itself (not inside the Home card) so it sits above the tab bar.
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div ref={sheetRef} className="modal edit-sheet quest-sheet" role="dialog" aria-modal="true" aria-labelledby="quest-sheet-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" {...drag} />
        <div className="modal-header">
          <div className="modal-title" id="quest-sheet-title">{quest.title}</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close"><X aria-hidden="true" /></button>
        </div>
        <div className="quest-sheet-body">
          <div className="quest-sheet-label">How to do it</div>
          <ol className="quest-steps">
            {quest.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <div className={`quest-reward${quest.done ? ' got' : ''}`}>
            <span className="quest-reward-xp">{reward.chip}</span>
            <span className="quest-reward-text">
              <b>{reward.title}</b>
              {reward.note && <small>{reward.note}</small>}
            </span>
          </div>
          <button type="button" className="step-btn primary full-width" onClick={onClose}>Close</button>
          {!quest.done && <p className="quest-sheet-hint">It ticks by itself when the app sees it done.</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// The starter quests card on Home: a short, simple list. Tap a quest for the steps and the reward.
// It stays until every quest is done: it cannot be hidden.
export default function StarterQuests({ userId, quests, totalXp = 0 }) {
  const [all, setAll] = useState(false);
  const [openId, setOpenId] = useState(null);
  if (!quests || quests.complete) return null;

  const list = all ? quests.list : quests.list.filter((q) => !q.done).slice(0, 3);
  const open = quests.list.find((q) => q.id === openId) ?? null;

  return (
    <section className="welcome quests" aria-label="Starter quests">
      <div className="welcome-head">
        <strong>Starter quests</strong>
        <span className="quest-count">{quests.done} of {quests.total} · {quests.xp} XP</span>
      </div>
      <div className="quest-bar" role="progressbar" aria-valuemin={0} aria-valuemax={quests.totalXp} aria-valuenow={quests.xp} aria-label="Starter quest XP"><i style={{ width: `${Math.round((quests.xp / quests.totalXp) * 100)}%` }} /></div>
      <ul className="quest-list">
        {list.map((q) => (
          <li key={q.id}>
            <button type="button" className={`quest-row${q.done ? ' done' : ''}`} onClick={() => setOpenId(q.id)}>
              <span className="welcome-tick" aria-hidden="true">{q.done && <Check size={14} />}</span>
              <span className="quest-title">{q.title}{q.done && <span className="sr-only"> (done)</span>}</span>
              <span className="quest-xp">+{q.xp}</span>
              <ChevronRight className="quest-chev" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="quest-toggle" onClick={() => setAll((v) => !v)}>{all ? 'Show next up' : 'See all quests'}</button>
      {open && <QuestSheet quest={open} totalXp={totalXp} onClose={() => setOpenId(null)} />}
    </section>
  );
}
