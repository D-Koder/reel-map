// Where a signed-out visitor starts. Most people see the landing page. People who are clearly heading somewhere
// else skip it: an invite goes to sign-up, a shared place goes to log in (so it can be saved), and a device that has
// signed in before goes straight to log in. ?login=1, ?signup=1 and ?demo=1 pick a screen directly.
export function firstView({ search = globalThis.location?.search ?? '', sharedPlace = false, invited = false, knownDevice = false } = {}) {
  const params = new URLSearchParams(search);
  if (params.get('demo') === '1') return 'demo';
  if (params.get('signup') === '1') return 'signup';
  if (params.get('login') === '1') return 'login';
  if (invited || params.get('invite')) return 'signup';
  if (sharedPlace) return 'login';
  if (knownDevice) return 'login';
  return 'landing';
}
