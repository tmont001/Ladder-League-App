// src/hooks/useDismissibleLayer.js
import { useEffect, useRef, useCallback } from 'react';

export function useDismissibleLayer(isOpen, onClose) {
  const ref = useRef(null);
  const stableClose = useCallback(onClose, [onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return;

    const onMousedown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) stableClose();
    };
    const onKeydown = (e) => {
      if (e.key === 'Escape') stableClose();
    };

    document.addEventListener('mousedown', onMousedown);
    document.addEventListener('keydown', onKeydown);
    return () => {
      document.removeEventListener('mousedown', onMousedown);
      document.removeEventListener('keydown', onKeydown);
    };
  }, [isOpen, stableClose]);

  return ref;
}
