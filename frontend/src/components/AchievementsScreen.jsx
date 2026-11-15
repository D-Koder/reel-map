import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Gift, Lock, Medal, ScrollText, Star } from 'lucide-react';
import { BADGE_ICONS } from './AchievementsSection';
import { PRIZE_ICONS } from './prizeIcons';
import { FRAMES, frameUnlocked } from '../lib/achievements';
import { PIN_PATTERNS, patternUnlocked } from '../lib/pinPatterns';
import { LEVEL_XP, XP, badgeXp } from '../lib/levels';
import useCountUp from '../hooks/useCountUp';
import { QuestSheet } from './StarterQuests';
import { defaultTab, firstReady, nextUpBadges } from '../lib/achievementsView';

const TABS = ['All', 'Explore', 'Together', 'Moments', 'Create'];
const RING = 2 * Math.PI * 28;
const HERO_RING = 2 * Math.PI * 36;
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// badge state: soon (needs data the app lacks), todo, ready (earned, not claimed), done (claimed)
const stateOf = (badge, claimed) => (badge.soon ? 'soon' : badge.earned ? (claimed.has(badge.id) ? 'done' : 'ready') : 'todo');

function Ring({ pct, state, Icon }) {
  return (
    <span className={`ax-ring s-${state}`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="ax-trk" cx="32" cy="32" r="28" />
        <circle className="ax-prg" cx="32" cy="32" r="28" strokeDasharray={RING} strokeDashoffset={RING * (1 - pct)} />
      </svg>
      <span className="ax-in">{state === 'soon' ? <Lock aria-hidden="true" /> : <Icon aria-hidden="true" />}</span>
    </span>
  );
}

// The level bar. On a level-up it fills to the end first, the new level pops in, then the bar starts again from empty
// and fills to the new progress. It never runs backwards.
function useLevelBar(level, pct) {
  const [bar, setBar] = useState({ level, pct, animate: false, pop: 0 });
  const seen = useRef(level);
  useEffect(() => {
    if (level > seen.current && !reduced()) {
      seen.current = level;
      setBar((b) => ({ ...b, pct: 100, animate: true }));
      const t1 = setTimeout(() => {
        setBar((b) => ({ level, pct: 0, animate: false, pop: b.pop + 1 }));
        requestAnimationFrame(() => requestAnimationFrame(() => setBar((b) => ({ ...b, pct, animate: true }))));
      }, 900);
      return () => clearTimeout(t1);
    }
    seen.current = level;
    setBar((b) => ({ ...b, level, pct, animate: true }));
    return undefined;
  }, [level, pct]);
  return bar;
}

// The Achievements screen: a player card on top (level, XP, loot), then three tabs: Quests, Badges and Rewards.
export default function AchievementsScreen({ achievements, onClose }) {
  const { badges, level, xp, prizes, readyBadges, claimedBadges, earnedIds, title, quests, claimBadge, claimPrize } = achievements;
  const readyPrizes = prizes.filter((p) => p.state === 'ready');
  const totalReady = readyBadges.length + readyPrizes.length;
  const [tab, setTab] = useState(() => defaultTab({ ready: totalReady, questsComplete: Boolean(quests?.complete) }));
  const [cat, setCat] = useState('All');
  const [sheet, setSheet] = useState(null); // { kind: 'badge' | 'prize', id }
  const [questId, setQuestId] = useState(null);
  const [allQuests, setAllQuests] = useState(false);
  const [flash, setFlash] = useState(null); // 'badge:id' or 'prize:level', pulses once after the gold strip is tapped
  const shownXp = useCountUp(xp);
  const bar = useLevelBar(level.level, level.pct);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (questId) setQuestId(null);
      else if (sheet) setSheet(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, questId, onClose]);

  const nextPrize = prizes.find((p) => p.state === 'next');
  const frames = FRAMES.filter((f) => frameUnlocked(f, earnedIds)).length;
  const withState = badges.map((b) => ({ ...b, st: stateOf(b, claimedBadges) }));
  const nextUp = nextUpBadges(withState);
  const shown = withState.filter((b) => cat === 'All' || b.cat === cat);
  const earnedCount = badges.filter((b) => b.earned && claimedBadges.has(b.id)).length;
  const openQuest = quests?.list.find((q) => q.id === questId) ?? null;

  // The gold strip takes you to the reward, on the tab it lives on, and pulses it. The chest opens from the reward itself.
  const goToReady = () => {
    const target = firstReady({ readyBadges, readyPrizes });
    if (!target) return;
    setTab(target.tab);
    setFlash(`${target.kind}:${target.id}`);
    setTimeout(() => {
      document.querySelector('.ax2-flash')?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    }, 60);
    setTimeout(() => setFlash(null), 2400);
  };
  const flashClass = (key) => (flash === key ? ' ax2-flash' : '');

  const sheetBadge = sheet?.kind === 'badge' ? withState.find((b) => b.id === sheet.id) : null;
  const sheetPrize = sheet?.kind === 'prize' ? prizes.find((p) => p.level === sheet.id) : null;

  const pct = bar.pct;
  const label = level.max ? 'MAX LEVEL' : `${level.left} XP to Level ${level.level + 1}`;

  return (
    <div className="ax" role="dialog" aria-modal="true" aria-label="Achievements">
      <div className="ax-top">
        <button type="button" className="ax-back" aria-label="Back" onClick={onClose}><ChevronLeft aria-hidden="true" /></button>
        <h2>Achievements</h2>
      </div>
      <div className="ax-scroll">
        <div className="ax2-hero">
          <div className="ax2-hero-row">
            <div className="ax2-ring">
              <svg viewBox="0 0 84 84" aria-hidden="true">
                <circle className="trk" cx="42" cy="42" r="36" />
                <circle className="val" cx="42" cy="42" r="36" strokeDasharray={HERO_RING} strokeDashoffset={HERO_RING * (1 - pct / 100)} style={bar.animate ? undefined : { transition: 'none' }} />
              </svg>
              <b key={bar.pop} className={bar.pop ? 'pop' : ''}>{bar.level}</b>
            </div>
            <div>
              <div className="ax2-lv">Level {bar.level}</div>
              {title && <span className="ax2-title">{title}</span>}
            </div>
          </div>
          <div>
            <div className="ax2-xp" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level.pct} aria-label="Progress to the next level"><i style={{ width: `${pct}%`, ...(bar.animate ? {} : { transition: 'none' }) }} /></div>
            <div className="ax2-xp-l"><span>{shownXp} XP</span><span>{bar.pct === 100 && bar.level < level.level ? 'Level up!' : label}</span></div>
          </div>
          <div className="ax2-stats">
            <div><b>{earnedCount}/{badges.length}</b>Badges</div>
            <div><b>{frames}/{FRAMES.length}</b>Frames</div>
            <div><b>{quests?.done ?? 0}/{quests?.total ?? 9}</b>Quests</div>
          </div>
        </div>

        {totalReady > 0 ? (
          <button type="button" className="ax-claim" onClick={goToReady}>
            <Gift aria-hidden="true" />
            <span className="ax-grow">{totalReady} reward{totalReady > 1 ? 's' : ''} ready!<small>{readyBadges.length ? readyBadges[0].name : `Level ${readyPrizes[0].level} prize`}{totalReady > 1 ? ' and more' : ''} · XP on every claim</small></span>
            <span className="ax-go">Claim</span>
          </button>
        ) : (
          <div className="ax-claim none"><Check aria-hidden="true" /><span className="ax-grow">Nothing to claim<small>{nextPrize ? `Next prize, Level ${nextPrize.level}: ${nextPrize.name}` : 'Every prize unlocked!'}</small></span></div>
        )}

        <div className="ax2-tabs" role="tablist" aria-label="Achievements sections">
          <button type="button" role="tab" aria-selected={tab === 'quests'} onClick={() => setTab('quests')}><ScrollText aria-hidden="true" /> Quests{quests && !quests.complete ? <span className="ax2-dot">{quests.total - quests.done}</span> : null}</button>
          <button type="button" role="tab" aria-selected={tab === 'badges'} onClick={() => setTab('badges')}><Medal aria-hidden="true" /> Badges{readyBadges.length ? <span className="ax2-dot">{readyBadges.length}</span> : null}</button>
          <button type="button" role="tab" aria-selected={tab === 'rewards'} onClick={() => setTab('rewards')}><Gift aria-hidden="true" /> Rewards{readyPrizes.length ? <span className="ax2-dot">{readyPrizes.length}</span> : null}</button>
        </div>

        {tab === 'quests' && quests && (
          <div className="ax2-panel" role="tabpanel">
            {quests.complete ? (
              <>
                <div className="ax2-alldone"><span className="ax2-tick"><Check aria-hidden="true" /></span><div><b>All starter quests done</b><small>You earned {quests.xp} XP. Here is what to chase next.</small></div></div>
                <div className="ax-sec">Next up<small>closest to done</small></div>
                {nextUp.length ? nextUp.map((b) => {
                  const Icon = BADGE_ICONS[b.icon] ?? Medal;
                  return (
                    <button type="button" key={b.id} className="ax-quest" onClick={() => { setTab('badges'); setSheet({ kind: 'badge', id: b.id }); }}>
                      <span className="ax-q-ic"><Icon aria-hidden="true" /></span>
                      <span className="ax-grow"><b>{b.name}</b><small>{b.how}</small><span className="ax-bar"><i style={{ width: `${(b.count / b.target) * 100}%` }} /></span></span>
                      <span className="ax2-togo"><b>{b.target - b.count}</b>to go</span>
                    </button>
                  );
                }) : <div className="ax-quest"><span className="ax-grow"><b>All caught up</b><small>Every playable badge is done.</small></span></div>}
              </>
            ) : (
              <>
                <div className="ax-sec">Starter quests<small>{quests.done} of {quests.total} · {quests.xp} XP</small></div>
                <div className="ax2-qcard">
                  <div className="ax2-qbar" role="progressbar" aria-valuemin={0} aria-valuemax={quests.totalXp} aria-valuenow={quests.xp} aria-label="Starter quest XP"><i style={{ width: `${Math.round((quests.xp / quests.totalXp) * 100)}%` }} /></div>
                  <ul className="quest-list">
                    {(allQuests ? quests.list : quests.list.filter((q) => !q.done).slice(0, 3)).map((q) => (
                      <li key={q.id}>
                        <button type="button" className={`quest-row${q.done ? ' done' : ''}`} onClick={() => setQuestId(q.id)}>
                          <span className="welcome-tick" aria-hidden="true">{q.done && <Check size={14} />}</span>
                          <span className="quest-title">{q.title}{q.done && <span className="sr-only"> (done)</span>}</span>
                          <span className="quest-xp">+{q.xp}</span>
                          <ChevronRight className="quest-chev" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="quest-toggle" onClick={() => setAllQuests((v) => !v)}>{allQuests ? 'Show next up' : 'See all quests'}</button>
                </div>
                <p className="ax-foot">Quests tick by themselves when the app sees them done.</p>
              </>
            )}
          </div>
        )}

        {tab === 'badges' && (
          <div className="ax2-panel" role="tabpanel">
            <div className="ax-sec">All badges<small>{earnedCount} of {badges.length} earned</small></div>
            <div className="ax-tabs" role="group" aria-label="Badge categories">
              {TABS.map((t) => <button type="button" key={t} aria-pressed={cat === t} aria-selected={cat === t} onClick={() => setCat(t)}>{t}</button>)}
            </div>
            <div className="ax-grid" key={cat}>
              {shown.map((b, i) => {
                const Icon = BADGE_ICONS[b.icon] ?? Medal;
                const full = b.st === 'ready' || b.st === 'done';
                return (
                  <button type="button" key={b.id} className={`ax-tile ax-enter ${b.st}${flashClass(`badge:${b.id}`)}`} style={{ animationDelay: `${i * 0.04}s` }} onClick={() => setSheet({ kind: 'badge', id: b.id })}>
                    {b.st === 'ready' && <span className="ax-tag c">CLAIM</span>}
                    {b.st === 'done' && <span className="ax2-stamp" aria-hidden="true">DONE</span>}
                    <Ring pct={full ? 1 : b.count / b.target} state={b.st} Icon={Icon} />
                    <b>{b.name}</b>
                    <small>{b.st === 'soon' ? 'Coming soon' : b.st === 'done' ? 'Claimed' : `${b.count} / ${b.target}`}</small>
                  </button>
                );
              })}
            </div>
            <p className="ax-foot">Badges marked Coming soon need data the app does not collect yet.</p>
          </div>
        )}

        {tab === 'rewards' && (
          <div className="ax2-panel" role="tabpanel">
            <div className="ax-sec">Level rewards<small>You are Level {level.level}</small></div>
            <div className="ax2-path">
              {prizes.map((p) => {
                const Icon = PRIZE_ICONS[p.icon] ?? Gift;
                return (
                  <button type="button" key={p.level} className={`ax2-node ${p.state}${flashClass(`prize:${p.level}`)}`} onClick={() => (p.state === 'ready' ? claimPrize(p.level) : setSheet({ kind: 'prize', id: p.level }))}>
                    <span className="ax2-lvl">LEVEL<b>{p.level}</b></span>
                    <span className="ax2-nm"><Icon aria-hidden="true" className="ax2-nm-ic" />{p.name}<small>{p.short}</small></span>
                    <span className="ax2-st">{p.state === 'got' ? 'Claimed' : p.state === 'ready' ? 'Claim' : p.state === 'next' ? `${Math.max(0, LEVEL_XP[p.level - 1] - xp)} XP` : 'Locked'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <details className="ax2-rules">
          <summary>How XP works</summary>
          <ul className="ax-rules">
            <li><b>+{XP.visit}</b> a place done (+{XP.visitAfterCap} after five in a day)</li>
            <li><b>+{XP.review}</b> a review, <b>+{XP.photo}</b> each photo (up to {XP.photosMax})</li>
            <li><b>x{XP.together}</b> when you go with a friend</li>
            <li><b>+{XP.save}</b> a place saved</li>
            <li><b>+{XP.badge}</b> a badge (Test Driver is +{badgeXp('demo')}), <b>+{XP.prize}</b> a level prize, when you claim it</li>
            <li><b>+5 to +15</b> each starter quest, once</li>
          </ul>
        </details>
        <p className="ax-foot">Claims are saved on this device.</p>
      </div>

      {openQuest && <QuestSheet quest={openQuest} totalXp={xp} onClose={() => setQuestId(null)} />}

      {(sheetBadge || sheetPrize) && (
        <div className="ax-scrim" onClick={() => setSheet(null)}>
          <div className="ax-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            {sheetBadge && (() => {
              const b = sheetBadge;
              const Icon = BADGE_ICONS[b.icon] ?? Medal;
              const perks = [b.frame && `Frame: ${FRAMES.find((f) => f.id === b.frame)?.name}`, b.title && `Title: ${b.title}`, b.reward && (b.rewardBuilt ? b.reward : `${b.reward} (coming soon)`)].filter(Boolean);
              return (
                <>
                  <div className="ax-sheet-h"><Ring pct={b.st === 'todo' ? b.count / b.target : 1} state={b.st} Icon={Icon} /><div><h3>{b.name}</h3><p>{b.how}</p></div></div>
                  {b.st === 'soon' ? <p>Coming soon. This badge needs data the app does not collect yet.</p> : (
                    <div><div className="ax-bar big"><i style={{ width: `${b.st === 'todo' ? (b.count / b.target) * 100 : 100}%` }} /></div><p>{b.st === 'done' ? 'Claimed' : `${b.count} of ${b.target}`}</p></div>
                  )}
                  <div className="ax-eyebrow">Reward</div>
                  <ul className="ax-perks">
                    {perks.map((t) => <li key={t}><Star aria-hidden="true" /> {t}</li>)}
                    <li><Star aria-hidden="true" /> +{badgeXp(b.id)} XP when you claim it</li>
                  </ul>
                  {b.st === 'ready'
                    ? <button type="button" className="step-btn primary ax-gold" onClick={() => { claimBadge(b.id); setSheet(null); }}>Claim reward</button>
                    : <button type="button" className="step-btn secondary" onClick={() => setSheet(null)}>{b.st === 'done' ? 'Nice' : 'Got it'}</button>}
                </>
              );
            })()}
            {sheetPrize && (() => {
              const p = sheetPrize;
              const Icon = PRIZE_ICONS[p.icon] ?? Gift;
              return (
                <>
                  <div className="ax-sheet-h"><span className={`ax-ring ax-solo ${p.state}`}><span className="ax-in">{p.state === 'locked' ? <Lock aria-hidden="true" /> : <Icon aria-hidden="true" />}</span></span><div><h3>Level {p.level} prize</h3><p>{p.state === 'got' ? 'Claimed' : p.state === 'ready' ? 'Ready to claim' : `${Math.max(0, p.level > level.level ? LEVEL_XP[p.level - 1] - xp : 0)} XP to go`}</p></div></div>
                  <ul className="ax-perks">
                    {p.lines.map((l) => <li key={l.text}><Star aria-hidden="true" /> {l.soon ? `${l.text} (coming soon)` : l.text}</li>)}
                    <li><Star aria-hidden="true" /> +{XP.prize} XP when you claim it</li>
                  </ul>
                  {p.state === 'ready'
                    ? <button type="button" className="step-btn primary ax-gold" onClick={() => { claimPrize(p.level); setSheet(null); }}>Claim prize</button>
                    : <button type="button" className="step-btn secondary" onClick={() => setSheet(null)}>{p.state === 'got' ? 'Nice' : 'Got it'}</button>}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
