import React, { useEffect, useRef, useState } from 'react';
import { Check, Gift } from 'lucide-react';
import { BADGE_ICONS } from './AchievementsSection';
import { levelInfo } from '../lib/levels';

const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const RING = 2 * Math.PI * 26;
const FAST = 6;

// "Here is what you earned", shown after a place is marked done (and reviewed). It plays calmly, one item at a time:
// the XP parts, the total counting up, the level bar, then each badge that moved. Tap anywhere to play the rest fast.
// summary is from lib/visitRewards.js. xpAfter is the person's XP now, so before is xpAfter minus what this visit earned.
export default function VisitRewards({ summary, xpAfter, onClose }) {
  const { parts, together, total, badges, earnedCount } = summary;
  const before = levelInfo(Math.max(0, xpAfter - total));
  const after = levelInfo(xpAfter);
  const leveledUp = after.level > before.level;

  const [shown, setShown] = useState(() => new Set());
  const [count, setCount] = useState(0);
  const [lv, setLv] = useState({ level: before.level, pct: before.pct, animate: false, pop: 0, label: `${before.left} XP to Level ${before.level + 1}`, xp: xpAfter - total });
  const [filled, setFilled] = useState(() => new Set());
  const [fast, setFast] = useState(false);
  const speed = useRef(1);
  const done = useRef(false);

  useEffect(() => {
    const show = (...keys) => setShown((s) => new Set([...s, ...keys]));
    const finalLevel = () => ({ level: after.level, pct: after.pct, animate: true, pop: 0, label: after.max ? 'MAX LEVEL' : `${after.left} XP to Level ${after.level + 1}`, xp: xpAfter });
    if (reduced()) {
      show(...everyKey());
      setCount(total);
      setFilled(new Set(badges.map((_, i) => i)));
      setLv({ ...finalLevel(), animate: false });
      done.current = true;
      return undefined;
    }

    // The steps, in "story time" (ms). A tap makes story time run faster, so the rest plays quickly and then it all shows.
    const steps = [];
    const later = [];
    let t = 300;
    let clock = 0;
    let counting = null;
    const at = (ms, fn) => steps.push([ms, fn]);
    const soon = (ms, fn) => later.push([clock + ms, fn]);

    parts.forEach((_, i) => { at(t, () => show(`part${i}`)); t += 600; });
    if (together) { at(t, () => show('together')); t += 600; }
    at(t, () => { show('total'); counting = { from: clock, ms: 1300 }; }); t += 1100;
    at(t, () => show('level')); t += 450;
    at(t, () => {
      if (leveledUp) {
        setLv((l) => ({ ...l, pct: 100, animate: true, label: 'Level up!' }));
        soon(1600, () => {
          setLv((l) => ({ ...l, level: after.level, pct: 0, animate: false, pop: l.pop + 1, xp: xpAfter }));
          requestAnimationFrame(() => requestAnimationFrame(() => setLv({ ...finalLevel(), pop: 1 })));
        });
      } else {
        setLv(finalLevel());
      }
    });
    t += leveledUp ? 1500 : 800;
    if (badges.length) {
      at(t, () => show('bhead')); t += 450;
      badges.forEach((b, i) => {
        at(t, () => { show(`badge${i}`); soon(250, () => setFilled((f) => new Set([...f, i]))); });
        t += b.earned ? 1100 : 750;
      });
      if (earnedCount) { at(t, () => show('reward')); t += 600; }
    }
    at(t, () => { show('end'); done.current = true; });

    let idx = 0;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      clock += (now - last) * speed.current;
      last = now;
      while (idx < steps.length && steps[idx][0] <= clock) steps[idx++][1]();
      for (let i = later.length - 1; i >= 0; i -= 1) {
        if (later[i][0] <= clock) { const [, fn] = later.splice(i, 1)[0]; fn(); }
      }
      if (counting) {
        const k = Math.min(1, (clock - counting.from) / counting.ms);
        setCount(Math.round(total * (1 - (1 - k) ** 3)));
        if (k >= 1) counting = null;
      }
      if (idx < steps.length || later.length || counting) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
    // The summary is fixed for the life of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function everyKey() {
    return [...parts.map((_, i) => `part${i}`), 'together', 'total', 'level', 'bhead', ...badges.map((_, i) => `badge${i}`), 'reward', 'end'];
  }

  const fastForward = () => {
    if (done.current || speed.current > 1) return;
    speed.current = FAST;
    setFast(true);
  };
  const cls = (key, extra = '') => `vr-seq${shown.has(key) ? ' in' : ''}${extra ? ` ${extra}` : ''}`;

  return (
    <div className="vr" role="dialog" aria-modal="true" aria-label="What you earned" style={{ '--spd': fast ? FAST : 1 }} onPointerDown={fastForward}>
      <div className="vr-in">
        <h2 className="vr-title">Nice one. Here is what you earned.</h2>

        <div className="vr-card vr-xp">
          {parts.map((p, i) => (
            <div key={p.label} className={cls(`part${i}`, 'vr-row')}><span className="l">{p.label}</span><span className="v">+{p.value}</span></div>
          ))}
          {together && <div className={cls('together', 'vr-row')}><span className="l">Went with a friend</span><span className="v">x1.5</span></div>}
          <div className={cls('total', 'vr-row vr-total')}><span className="l">XP earned</span><span className="v">+{count}</span></div>
          <div className={cls('level', 'vr-lvrow')}>
            <div className="vr-ring">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle className="t" cx="32" cy="32" r="26" />
                <circle className="v" cx="32" cy="32" r="26" strokeDasharray={RING} strokeDashoffset={RING * (1 - lv.pct / 100)} style={lv.animate ? undefined : { transition: 'none' }} />
              </svg>
              <b key={lv.pop} className={lv.pop ? 'pop' : ''}>{lv.level}</b>
            </div>
            <div className="vr-lvbar">
              <div className="vr-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lv.pct)} aria-label="Progress to the next level"><i style={{ width: `${lv.pct}%`, ...(lv.animate ? {} : { transition: 'none' }) }} /></div>
              <div className="vr-lvl-l"><span>{lv.xp} XP</span><span>{lv.label}</span></div>
            </div>
          </div>
        </div>

        {badges.length > 0 && (
          <>
            <div className={cls('bhead', 'vr-sec')}>Badge progress</div>
            <div className="vr-card vr-badges">
              {badges.map((b, i) => {
                const Icon = BADGE_ICONS[b.icon] ?? Gift;
                const got = b.earned;
                return (
                  <div key={b.id} className={cls(`badge${i}`, `vr-badge${got ? ' got' : ''}`)}>
                    <span className="m"><Icon aria-hidden="true" /></span>
                    <div className="tx">
                      <b>{b.name}{got ? ' earned!' : ''}</b>
                      <small>{got ? 'Ready to claim in Achievements' : `${b.from} → ${b.to} of ${b.target}`}</small>
                      <div className="vr-mini"><i style={{ width: `${((filled.has(i) ? b.to : b.from) / b.target) * 100}%` }} /></div>
                    </div>
                    <span className="chg">+{b.to - b.from}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {earnedCount > 0 && (
          <div className={cls('reward', 'vr-card vr-reward')}>
            <b><Gift aria-hidden="true" /> {earnedCount} reward{earnedCount > 1 ? 's' : ''} ready</b>
            <span>Claiming opens the treasure chest in Achievements, and gives +100 XP.</span>
          </div>
        )}

        <button type="button" className={cls('end', 'step-btn primary full-width vr-end')} onClick={onClose}><Check aria-hidden="true" /> Nice!</button>
        {!fast && !shown.has('end') && <div className="vr-hint">Tap anywhere to speed up</div>}
      </div>
    </div>
  );
}
