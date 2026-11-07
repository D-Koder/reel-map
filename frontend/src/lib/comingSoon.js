// The public domain shows a coming-soon page until launch. Visit any page with ?early=1 once to let a
// browser through (remembered on that device). Hides the screen only; it is not a security lock.
const GATED_HOSTS = ['waylitmaps.com', 'www.waylitmaps.com'];
const KEY = 'waylit-early-access';

export function showComingSoon() {
  if (!GATED_HOSTS.includes(window.location.hostname)) return false;
  try {
    if (new URLSearchParams(window.location.search).get('early') === '1') localStorage.setItem(KEY, '1');
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return true;
  }
}
