import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children, sport }) {
  const [isDark, setIsDark] = useState(() => {
    try {
      return localStorage.getItem('ll_theme') !== 'light';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const root = document.documentElement;

    // Theme (light / dark)
    root.classList.toggle('theme-dark', isDark);
    root.classList.toggle('theme-light', !isDark);
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    root.style.colorScheme = isDark ? 'dark' : 'light';
    try {
      localStorage.setItem('ll_theme', isDark ? 'dark' : 'light');
    } catch {}

    // Sport palette
    root.classList.toggle('sport-pickleball', sport === 'pickleball');
    root.classList.toggle('sport-tennis', sport === 'tennis' || !sport);
  }, [isDark, sport]);

  const toggleTheme = () => setIsDark((prev) => !prev);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
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
