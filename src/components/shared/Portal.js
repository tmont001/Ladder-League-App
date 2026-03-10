import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';

/**
 * Renders children into document.body via a React Portal,
 * escaping any transformed ancestor that would trap position:fixed.
 * Applies the current theme class so CSS variables resolve correctly.
 */
function Portal({ children }) {
  const { isDark } = useTheme();
  const el = useRef(document.createElement('div'));

  useEffect(() => {
    document.body.appendChild(el.current);
    return () => {
      document.body.removeChild(el.current);
    };
  }, []);

  // Keep the theme class in sync on the portal container
  useEffect(() => {
    el.current.className = isDark ? 'theme-dark' : 'theme-light';
  }, [isDark]);

  return createPortal(children, el.current);
}

export default Portal;
