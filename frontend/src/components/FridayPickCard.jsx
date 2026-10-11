import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { enableFridayPick, getPushSubscription, isPushSupported } from '../lib/push';
import { readJSON, writeJSON } from '../lib/storage';

// Asked once the user has a few places saved, so the notification has something to pick from.
const MIN_PLACES = 3;
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const snoozeKey = (userId) => `reelmap:friday-snoozed:${userId}`;

// Invites the user to turn on the Friday pick notification, at a moment it makes sense.
export default function FridayPickCard({ userId, placeCount, showToast }) {
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const snoozedAt = readJSON(snoozeKey(userId), 0);
    if (
      placeCount < MIN_PLACES
      || !isPushSupported()
      || Notification.permission === 'denied'
      || Date.now() - snoozedAt < SNOOZE_MS
    ) {
      setEligible(false);
      return undefined;
    }
    getPushSubscription()
      .then((subscription) => !cancelled && setEligible(!subscription))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, placeCount]);

  if (!eligible) return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      await enableFridayPick(userId);
      setEligible(false);
      showToast('Friday picks are on. See you Friday!');
    } catch (error) {
      showToast(`${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const notNow = () => {
    writeJSON(snoozeKey(userId), Date.now());
    setEligible(false);
  };

  return (
    <div className="friday-card" role="region" aria-label="Friday pick">
      <div className="friday-card-text">
        <div className="friday-card-title"><Bell className="ico" aria-hidden="true" /> Want a date idea every Friday?</div>
        <div className="friday-card-body">We'll pick one of your saved places that isn't booked yet.</div>
      </div>
      <div className="friday-card-actions">
        <button type="button" className="step-btn primary" onClick={turnOn} disabled={busy}>
          {busy ? 'Turning on…' : 'Turn on'}
        </button>
        <button type="button" className="step-btn secondary" onClick={notNow} disabled={busy}>
          Not now
        </button>
      </div>
    </div>
  );
}
