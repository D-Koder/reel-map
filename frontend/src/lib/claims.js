// Claimed badges and level prizes. Kept on the account (profiles.claims) so they follow the person to every device;
// until the database has that column they stay on this device. A claim is never removed, so merging is a union.
// Shape: { badges: ['first_save', ...], prizes: [1, 2, ...] }

const ids = (list) => (Array.isArray(list) ? list.filter((v) => typeof v === 'string' && v.length > 0 && v.length < 40) : []);
const levels = (list) => (Array.isArray(list) ? list.filter((v) => Number.isInteger(v) && v > 0 && v < 1000) : []);

export const cleanClaims = (claims) => ({ badges: [...new Set(ids(claims?.badges))], prizes: [...new Set(levels(claims?.prizes))].sort((a, b) => a - b) });

// Everything claimed on the account plus everything claimed on this device ("seen" is the old name for "claimed").
// `changed` is true when the device knew something the account did not, so the account should be updated.
export function mergeClaims(account, device = {}) {
  const base = cleanClaims(account);
  const merged = cleanClaims({
    badges: [...base.badges, ...ids(device.claimed ?? device.seen)],
    prizes: [...base.prizes, ...levels(device.prizes)],
  });
  return { ...merged, changed: merged.badges.length > base.badges.length || merged.prizes.length > base.prizes.length };
}

// The claims to save after one more badge or prize is claimed.
export const addClaim = (claims, { badge, prize }) => cleanClaims({
  badges: badge ? [...cleanClaims(claims).badges, badge] : claims?.badges,
  prizes: prize ? [...cleanClaims(claims).prizes, prize] : claims?.prizes,
});
