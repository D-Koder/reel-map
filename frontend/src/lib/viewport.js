// On iPhones the keyboard covers the page instead of shrinking it, so a bottom sheet ends up
// behind the keyboard. This keeps two CSS variables in step with the part of the screen that
// is still visible: --vv-top and --vv-height. Bottom sheets use them to sit above the keyboard.
export function trackVisibleViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
      root.style.setProperty('--vv-height', `${vv.height}px`);
      // True while the keyboard (or anything else) takes a real bite out of the screen.
      root.classList.toggle('keyboard-open', window.innerHeight - vv.height > 120);
    });
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
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
