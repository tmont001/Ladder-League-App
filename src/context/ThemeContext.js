import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    // Respect stored preference; default dark
    try {
      return localStorage.getItem('ll_theme') !== 'light';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    // Apply class to <html> for full-page coverage (Lighthouse best practice)
    const root = document.documentElement;
    root.classList.toggle('theme-dark', isDark);
    root.classList.toggle('theme-light', !isDark);
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    // Also set color-scheme for browser UI elements
    root.style.colorScheme = isDark ? 'dark' : 'light';
    try {
      localStorage.setItem('ll_theme', isDark ? 'dark' : 'light');
    } catch {}
  }, [isDark]);

  const toggleTheme = () => setIsDark((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {/* Keep the wrapper div for component tree, but primary theming is on <html> */}
      <div
        className={isDark ? 'theme-dark' : 'theme-light'}
        style={{ minHeight: '100vh' }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
