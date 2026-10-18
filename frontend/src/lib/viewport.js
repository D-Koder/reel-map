// On iPhones the keyboard covers the page instead of shrinking it, so a bottom sheet ends up
// behind the keyboard. This keeps two CSS variables in step with the part of the screen that
// is still visible: --vv-top and --vv-height. Bottom sheets use them to sit above the keyboard.
export function trackVisibleViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let frame = 0;
  let settle = 0;
  const measure = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
      root.style.setProperty('--vv-height', `${vv.height}px`);
      // True while the keyboard takes a real bite out of the screen. The keyboard is only up while
      // a field is being typed in: without one, a small reading (iOS gives one when the app comes back
      // from a notification, and may not send the full size after) would squash every sheet.
      const typing = document.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]');
      root.classList.toggle('keyboard-open', Boolean(typing) && window.innerHeight - vv.height > 120);
    });
  };
  // iOS settles the size late (after the keyboard closes or the app comes back), so measure again.
  const update = () => {
    measure();
    clearTimeout(settle);
    settle = setTimeout(measure, 500);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  window.addEventListener('pageshow', update);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && update());
  document.addEventListener('focusin', update);
  document.addEventListener('focusout', update);
  update();
}

// Keep a focused field in view inside its sheet once the keyboard has finished opening.
export function keepFocusedFieldVisible() {
  document.addEventListener('focusin', (event) => {
    const field = event.target;
    if (!field.matches?.('input, textarea, select') || !field.closest('.modal')) return;
    setTimeout(() => field.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 300);
  });
}
