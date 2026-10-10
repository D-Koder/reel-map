import { useRef } from 'react';

// Swipe a bottom sheet's handle down to close it. The sheet follows the finger.
// Released past 100px it closes, otherwise it springs back.
export default function useSheetDrag(sheetRef, onClose) {
  const startY = useRef(null);
  const offset = useRef(0);

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
