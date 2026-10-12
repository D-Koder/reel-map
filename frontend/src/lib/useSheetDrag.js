import { useEffect, useRef } from 'react';

// Swipe a bottom sheet's handle down to close it. The sheet follows the finger.
// Released past 100px it closes, otherwise it springs back.
// Pulling down on the content works too, once it's scrolled to the top (like iPhone sheets).
export default function useSheetDrag(sheetRef, onClose) {
  const startY = useRef(null);
  const offset = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return undefined;
    let fromY = null;
    let pulled = 0;
    const move = (px) => {
      sheet.style.transform = px ? `translateY(${px}px)` : '';
    };
    const onStart = (event) => {
      // Fields and the reorder handles keep their own gestures.
      if (event.touches.length !== 1 || event.target.closest('input, textarea, select, .mapboxgl-map')) return;
      fromY = sheet.scrollTop <= 0 ? event.touches[0].clientY : null;
      pulled = 0;
    };
    const onMove = (event) => {
      if (fromY === null) return;
      const dy = event.touches[0].clientY - fromY;
      // Scrolling up into the content, or the content has moved: let it scroll normally.
      if (dy <= 0 || sheet.scrollTop > 0) {
        if (pulled) move(0);
        fromY = pulled ? fromY : null;
        pulled = 0;
        return;
      }
      event.preventDefault();
      if (!pulled) sheet.style.transition = 'none';
      pulled = dy;
      move(dy);
    };
    const onEnd = () => {
      if (fromY === null) return;
      fromY = null;
      sheet.style.transition = '';
      if (pulled > 120) closeRef.current();
      else move(0);
      pulled = 0;
    };
    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onEnd);
    return () => {
      sheet.removeEventListener('touchstart', onStart);
      sheet.removeEventListener('touchmove', onMove);
      sheet.removeEventListener('touchend', onEnd);
      sheet.removeEventListener('touchcancel', onEnd);
    };
  }, [sheetRef]);

  const setOffset = (px) => {
    if (sheetRef.current) sheetRef.current.style.transform = px ? `translateY(${px}px)` : '';
  };

  const onPointerDown = (event) => {
    startY.current = event.clientY;
    offset.current = 0;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  };

  const onPointerMove = (event) => {
    if (startY.current === null) return;
    offset.current = Math.max(0, event.clientY - startY.current);
    setOffset(offset.current);
  };

  const onPointerEnd = () => {
    if (startY.current === null) return;
    startY.current = null;
    if (sheetRef.current) sheetRef.current.style.transition = '';
    if (offset.current > 100) onClose();
    else setOffset(0);
  };

  return { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd };
}
