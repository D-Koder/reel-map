// Which kind of device this is, so Settings only offers what works there.
// 'ios' (iPhone/iPad), 'android', or 'desktop'. Anything else counts as desktop.
export function detectPlatform() {
  const ua = navigator.userAgent || '';
  // iPadOS 13+ says it is a Mac; a touch screen tells them apart.
  const ipad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || ipad) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

// True when the app was opened from the home screen (installed), not a browser tab.
export function isInstalled() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}
