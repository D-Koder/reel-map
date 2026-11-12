import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, Crown, Gift, Lock, Medal, Star } from 'lucide-react';
import { BADGE_ICONS } from './AchievementsSection';
import { PRIZE_ICONS } from './prizeIcons';
import { FRAMES, frameUnlocked } from '../lib/achievements';
import { PIN_PATTERNS, patternUnlocked } from '../lib/pinPatterns';
import { LEVEL_XP, XP } from '../lib/levels';
import useCountUp from '../hooks/useCountUp';

const TABS = ['All', 'Explore', 'Together', 'Moments', 'Create'];
const RING = 2 * Math.PI * 28;

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

// The Achievements screen: level and XP, rewards ready to claim, the closest badges, level prizes and every badge.
export default function AchievementsScreen({ achievements, onClose }) {
  const { badges, level, xp, prizes, readyBadges, claimedBadges, earnedIds, titles, claimBadge, claimPrize } = achievements;
  const [tab, setTab] = useState('All');
  const [sheet, setSheet] = useState(null); // { kind: 'badge' | 'prize', id }
  const trackRef = useRef(null);
  const shownXp = useCountUp(xp);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (sheet) setSheet(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, onClose]);

  // Slide the prize row to the next thing to claim or reach.
  useEffect(() => {
    const track = trackRef.current;
    const target = track?.querySelector('.ready, .next');
    if (track && target) track.scrollTo({ left: Math.max(0, target.offsetLeft - 12), behavior: 'smooth' });
  }, []);

  const readyPrizes = prizes.filter((p) => p.state === 'ready');
  const totalReady = readyBadges.length + readyPrizes.length;
  const nextPrize = prizes.find((p) => p.state === 'next');
  const frames = FRAMES.filter((f) => frameUnlocked(f, earnedIds)).length;
  const textures = PIN_PATTERNS.filter((p) => patternUnlocked(p, earnedIds)).length;
  const withState = badges.map((b) => ({ ...b, st: stateOf(b, claimedBadges) }));
  const nextUp = withState.filter((b) => b.st === 'todo').sort((a, b) => b.count / b.target - a.count / a.target).slice(0, 3);
  const shown = withState.filter((b) => tab === 'All' || b.cat === tab);

  const claimFirst = () => {
    if (readyBadges.length) claimBadge(readyBadges[0].id);
    else if (readyPrizes.length) claimPrize(readyPrizes[0].level);
  };
  const firstName = readyBadges.length ? readyBadges[0].name : readyPrizes.length ? `Level ${readyPrizes[0].level} prize` : '';

  const sheetBadge = sheet?.kind === 'badge' ? withState.find((b) => b.id === sheet.id) : null;
  const sheetPrize = sheet?.kind === 'prize' ? prizes.find((p) => p.level === sheet.id) : null;

  return (
    <div className="ax" role="dialog" aria-modal="true" aria-label="Achievements">
      <div className="ax-top">
        <button type="button" className="ax-back" aria-label="Back" onClick={onClose}><ChevronLeft aria-hidden="true" /></button>
        <h2>Achievements</h2>
      </div>
      <div className="ax-scroll">
        <div className="ax-level">
          <div className="ax-level-row">
            <div className="ax-level-badge" key={level.level}>{level.level}</div>
            <div>
              <h3>Level {level.level}</h3>
              <small>{badges.filter((b) => b.earned && claimedBadges.has(b.id)).length} of {badges.length} badges claimed</small>
            </div>
          </div>
          <div>
            <div className="ax-xp" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level.pct} aria-label="Progress to the next level"><i style={{ width: `${level.pct}%` }} /></div>
            <div className="ax-xp-l"><span>{shownXp} XP</span><span>{level.max ? 'MAX LEVEL' : `${level.left} XP to Level ${level.level + 1}`}</span></div>
          </div>
          <div className="ax-next-prize">
            {nextPrize ? <><Gift aria-hidden="true" /> <span>Next prize, Level {nextPrize.level}: {nextPrize.name}</span></> : <><Crown aria-hidden="true" /> <span>Max level. Every prize unlocked!</span></>}
          </div>
          <div className="ax-counters">
            <div><b>{frames}/{FRAMES.length}</b>Frames</div>
            <div><b>{titles.length}</b>Titles</div>
            <div><b>{textures}/{PIN_PATTERNS.length}</b>Textures</div>
          </div>
        </div>

        {totalReady > 0 ? (
          <button type="button" className="ax-claim" onClick={claimFirst}>
            <Gift aria-hidden="true" />
            <span className="ax-grow">{totalReady} reward{totalReady > 1 ? 's' : ''} ready!<small>{firstName}{totalReady > 1 ? ' and more' : ''} · XP on every claim</small></span>
            <span className="ax-go">Claim</span>
          </button>
        ) : (
          <div className="ax-claim none"><Check aria-hidden="true" /><span className="ax-grow">Nothing to claim. Keep going!</span></div>
        )}

        <div className="ax-sec">Earning XP<small>every visit counts</small></div>
        <ul className="ax-rules">
          <li><b>+{XP.visit}</b> a place done</li>
          <li><b>+{XP.review}</b> a review, <b>+{XP.photo}</b> each photo (up to {XP.photosMax})</li>
          <li><b>x{XP.together}</b> when you go with a friend</li>
          <li><b>+{XP.save}</b> a place saved</li>
          <li><b>+{XP.badge}</b> a badge, <b>+{XP.prize}</b> a level prize, when you claim it</li>
        </ul>

        <div className="ax-sec">Next up<small>closest to done</small></div>
        {nextUp.length ? nextUp.map((b, i) => {
          const Icon = BADGE_ICONS[b.icon] ?? Medal;
          return (
            <button type="button" key={b.id} className="ax-quest ax-enter" style={{ animationDelay: `${0.05 + i * 0.07}s` }} onClick={() => setSheet({ kind: 'badge', id: b.id })}>
              <span className="ax-q-ic"><Icon aria-hidden="true" /></span>
              <span className="ax-grow"><b>{b.name}</b><span className="ax-bar"><i style={{ width: `${(b.count / b.target) * 100}%` }} /></span><small>{b.count} of {b.target} · {b.target - b.count} to go</small></span>
              <span className="ax-rwd">{b.frame ? 'Frame' : b.title ? `Title: ${b.title}` : b.reward}</span>
            </button>
          );
        }) : <div className="ax-quest"><span className="ax-grow"><b>All caught up</b><small>Every playable badge is done.</small></span></div>}

        <div className="ax-sec">Level rewards<small>tap one for details</small></div>
        <div className="ax-track" ref={trackRef}>
          {prizes.map((p, i) => {
            const Icon = PRIZE_ICONS[p.icon] ?? Gift;
            return (
              <button type="button" key={p.level} className={`ax-stop ax-enter ${p.state}`} style={{ animationDelay: `${0.1 + i * 0.07}s` }} onClick={() => setSheet({ kind: 'prize', id: p.level })}>
                {p.state === 'ready' && <span className="ax-tag c">CLAIM</span>}
                {p.state === 'got' && <span className="ax-tag k">DONE</span>}
                <span className="ax-lv">Level {p.level}</span>
                <span className="ax-pic">{p.state === 'locked' ? <Lock aria-hidden="true" /> : <Icon aria-hidden="true" />}</span>
                <b>{p.name}</b>
                <small>{p.state === 'got' ? 'Claimed' : p.state === 'ready' ? `Tap to claim +${XP.prize} XP` : p.short}</small>
              </button>
            );
          })}
        </div>

        <div className="ax-sec">All badges<small>tap one for details</small></div>
        <div className="ax-tabs" role="tablist">
          {TABS.map((t) => <button type="button" key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t}</button>)}
        </div>
        <div className="ax-grid" key={tab}>
          {shown.map((b, i) => {
            const Icon = BADGE_ICONS[b.icon] ?? Medal;
            const full = b.st === 'ready' || b.st === 'done';
            return (
              <button type="button" key={b.id} className={`ax-tile ax-enter ${b.st}`} style={{ animationDelay: `${i * 0.04}s` }} onClick={() => setSheet({ kind: 'badge', id: b.id })}>
                {b.st === 'ready' && <span className="ax-tag c">CLAIM</span>}
                {b.st === 'done' && <span className="ax-tag k">DONE</span>}
                <Ring pct={full ? 1 : b.count / b.target} state={b.st} Icon={Icon} />
                <b>{b.name}</b>
                <small>{b.st === 'soon' ? 'Coming soon' : b.st === 'done' ? 'Claimed' : `${b.count} / ${b.target}`}</small>
              </button>
            );
          })}
        </div>
        <p className="ax-foot">Badges marked Coming soon need data the app does not collect yet. Claims are saved on this device.</p>
      </div>

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
                    <li><Star aria-hidden="true" /> +{XP.badge} XP when you claim it</li>
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
