import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders children into document.body via a React Portal,
 * escaping any transformed ancestor that would trap position:fixed.
 */
function Portal({ children }) {
  const el = useRef(document.createElement('div'));

  useEffect(() => {
    document.body.appendChild(el.current);
    return () => {
      document.body.removeChild(el.current);
    };
  }, []);

  return createPortal(children, el.current);
}

export default Portal;
