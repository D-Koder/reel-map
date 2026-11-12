import React, { useEffect, useState } from 'react';
import { Frame, Gift, Medal, Sparkles, Star } from 'lucide-react';
import { BADGE_ICONS } from './AchievementsSection';
import { PRIZE_ICONS } from './prizeIcons';
import { frameById } from '../lib/achievements';
import { PRIZES, XP } from '../lib/levels';
import useCountUp from '../hooks/useCountUp';

const COLOURS = ['#e8590c', '#ffd23f', '#e0336a', '#0ea5e9', '#16a34a', '#7c3aed'];

// Falling confetti and twinkling sparkles, placed once so a re-render does not move them.
function useScatter() {
  return useState(() => ({
    confetti: Array.from({ length: 48 }, (_, i) => ({ left: Math.random() * 100, colour: COLOURS[i % 6], delay: Math.random() * 2, time: 2 + Math.random() * 1.5 })),
    sparks: Array.from({ length: 12 }, () => ({ left: 6 + Math.random() * 88, top: 18 + Math.random() * 60, delay: Math.random() * 1.6 })),
  }))[0];
}

// The celebration for a claimed badge, a claimed level prize, or moving up a level.
// reward: { kind: 'badge', badge } or { kind: 'prize', prize }. levelUp: { from, to, prizes } (used when there is no reward).
export default function RewardCelebration({ reward, levelUp, onClose, onWear }) {
  const scatter = useScatter();
  const kind = reward?.kind ?? 'level';
  const badge = reward?.badge;
  const prize = reward?.prize;
  const variant = badge?.id === 'spontaneous' ? 'bolt' : badge?.id === 'finally' ? 'years' : 'plain';
  const gained = kind === 'badge' ? XP.badge : kind === 'prize' ? XP.prize : 0;
  const xp = useCountUp(gained, { from: 0, delay: 500 });
  const levelNumber = useCountUp(levelUp?.to ?? 0, { from: levelUp?.from ?? 0, delay: 450 });

  useEffect(() => {
    navigator.vibrate?.([30, 60, 30]);
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  let eyebrow;
  let headline;
  let line;
  let big;
  let lines = [];
  let wearFrame = null;
  let wearTitle = null;

  if (kind === 'badge') {
    const Icon = BADGE_ICONS[badge.icon] ?? Medal;
    const frame = badge.frame ? frameById(badge.frame) : null;
    eyebrow = variant === 'plain' ? 'New badge' : badge.name;
    headline = { bolt: 'Spontaneous!', years: 'Finally!', plain: badge.name }[variant];
    line = { bolt: 'Saved and visited within a day. That is the spirit.', years: 'You saved it a long time ago, and you made it.', plain: badge.how }[variant];
    big = <Icon aria-hidden="true" />;
    if (frame) lines.push({ Icon: Frame, text: `Frame: ${frame.name}` });
    if (badge.title) lines.push({ Icon: Medal, text: `Title: ${badge.title}` });
    if (badge.reward) lines.push({ Icon: Sparkles, text: badge.rewardBuilt ? badge.reward : `Coming soon: ${badge.reward}` });
    wearFrame = badge.frame ?? null;
    wearTitle = badge.title ?? null;
  } else if (kind === 'prize') {
    const Icon = PRIZE_ICONS[prize.icon] ?? Gift;
    eyebrow = `Level ${prize.level} prize`;
    headline = 'Prize claimed!';
    big = <Icon aria-hidden="true" />;
    lines = prize.lines.map((l) => ({ Icon: l.text.startsWith('Title') ? Medal : Gift, text: l.soon ? `Coming soon: ${l.text}` : l.text }));
    wearFrame = prize.frame ?? null;
    wearTitle = prize.titles?.[0] ?? null;
  } else {
    eyebrow = 'Level up';
    headline = `Level ${levelUp.to}!`;
    big = <span className="rw-level">{levelNumber}</span>;
    const next = PRIZES.find((p) => p.level > levelUp.to);
    if (levelUp.prizes.length) {
      line = 'Prizes ready to claim in Achievements';
      lines = levelUp.prizes.flatMap((p) => p.lines.map((l) => ({ Icon: l.text.startsWith('Title') ? Medal : Gift, text: `${levelUp.prizes.length > 1 ? `Lv ${p.level}: ` : ''}${l.soon ? `Coming soon: ${l.text}` : l.text}` })));
    } else {
      line = next ? `Next prize at Level ${next.level}: ${next.name}` : 'Max level. Every prize is yours!';
    }
  }

  const canWear = wearFrame || wearTitle;
  return (
    <div className={`celebrate-overlay badge-celebrate rw ${kind === 'badge' ? variant : ''}`} onClick={onClose}>
      {variant === 'bolt' && <div className="badge-flash" aria-hidden="true" />}
      <div className="rw-fx" aria-hidden="true">
        <div className="rw-rays" />
        <div className="rw-burst"><i /><i /><i /></div>
        {scatter.sparks.map((s, i) => <span key={i} className="rw-spark" style={{ left: `${s.left}%`, top: `${s.top}%`, animationDelay: `${s.delay}s` }}>✦</span>)}
        <div className="rw-confetti">
          {scatter.confetti.map((c, i) => <i key={i} style={{ left: `${c.left}%`, background: c.colour, animationDelay: `${c.delay}s`, animationDuration: `${c.time}s` }} />)}
        </div>
      </div>
      <div className="celebrate-card badge-card rw-card" role="dialog" aria-modal="true" aria-labelledby="rw-title" onClick={(event) => event.stopPropagation()}>
        <div className="badge-eyebrow">{eyebrow}</div>
        <div className="badge-big rw-big">{big}</div>
        <div className="celebrate-title" id="rw-title">{headline}</div>
        {line && <p className="celebrate-text">{line}</p>}
        {gained > 0 && <div className="rw-xp">+{xp} XP</div>}
        {reward && levelUp && <div className="rw-levelup"><Star aria-hidden="true" /> Level up! You are Level {levelUp.to}</div>}
        {lines.length > 0 && (
          <ul className="badge-unlocks rw-lines">
            {lines.map((l, i) => <li key={i} style={{ animationDelay: `${0.6 + i * 0.15}s` }}><l.Icon aria-hidden="true" /> {l.text}</li>)}
          </ul>
        )}
        <div className="badge-actions">
          {kind !== 'level' && canWear && <button type="button" className="step-btn secondary" onClick={() => onWear(wearFrame, wearTitle)}>Wear it now</button>}
          <button type="button" className="step-btn primary" autoFocus onClick={onClose}>{kind === 'level' ? 'Awesome' : 'Nice!'}</button>
        </div>
      </div>
    </div>
  );
}
