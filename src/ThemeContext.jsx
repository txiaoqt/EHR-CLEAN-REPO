// src/ThemeContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export const THEME_STORAGE_KEY = 'tup-clinic-theme';
export const LEGACY_STORAGE_KEY = 'ehr_theme';
export const SETTINGS_STORAGE_KEY = 'clinic-settings';

export const normalizeTheme = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'dark') return 'dark';
    if (trimmed === 'light') return 'light';
    // 'system' is a MODE, not a theme: it is stored as the preference and
    // resolved to light or dark when applied to the document.
    if (trimmed === 'system') return 'system';
  }
  return 'light';
};

/** Resolves a stored mode to the theme the document should actually use. */
export const resolveTheme = (mode) => (normalizeTheme(mode) === 'system' ? getSystemTheme() : normalizeTheme(mode));

export const getSystemTheme = () => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
};

export const getStoredTheme = () => {
  if (typeof window === 'undefined') return null;
  const valid = (v) => v === 'dark' || v === 'light' || v === 'system';
  try {
    const primary = localStorage.getItem(THEME_STORAGE_KEY);
    if (valid(primary)) return primary;

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (valid(legacy)) return legacy;

    const settingsRaw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (settingsRaw) {
      const parsed = JSON.parse(settingsRaw);
      if (valid(parsed?.theme)) {
        return parsed.theme;
      }
    }
  } catch (_) {}
  return null;
};

export const resolveInitialTheme = () => {
  const explicit = getStoredTheme();
  if (explicit) return explicit;
  // No stored preference: remember 'system' rather than freezing today's OS
  // setting, so the app keeps following it.
  return 'system';
};

const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
  isDark: false,
});

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => resolveInitialTheme());

  const applyThemeToDOM = useCallback((mode) => {
    if (typeof document === 'undefined') return;
    // The attribute gets the RESOLVED theme, so the stylesheet only ever sees
    // light or dark; 'system' lives in state and in storage.
    const normalized = normalizeTheme(mode);
    const resolved = normalized === 'system' ? getSystemTheme() : normalized;
    document.documentElement.setAttribute('data-theme', resolved);

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', resolved === 'dark' ? '#0f172a' : '#8C1515');
    }
  }, []);

  const setTheme = useCallback((mode) => {
    const normalized = normalizeTheme(mode);
    setThemeState(normalized);
    applyThemeToDOM(normalized);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
      localStorage.setItem(LEGACY_STORAGE_KEY, normalized);

      const settingsRaw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...parsed, theme: normalized }));
    } catch (_) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tupThemeChanged', { detail: { theme: normalized } }));
      window.dispatchEvent(new CustomEvent('settingsChanged', { detail: { theme: normalized } }));
    }
  }, [applyThemeToDOM]);

  const toggleTheme = useCallback(() => {
    // Flip from what is actually on screen. With mode 'system' the raw value is
    // neither 'dark' nor 'light', so comparing it directly would always send the
    // user to dark instead of to the opposite of what they are looking at.
    setTheme(resolveTheme(theme) === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  // In 'system' mode, follow the OS when it changes rather than freezing the
  // value that happened to be current at load.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    if (normalizeTheme(theme) !== 'system') return undefined;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyThemeToDOM('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [theme, applyThemeToDOM]);

  // Synchronize on mount and apply data-theme
  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme, applyThemeToDOM]);

  // Listen for storage events across tabs & custom events
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === THEME_STORAGE_KEY || e.key === LEGACY_STORAGE_KEY || e.key === SETTINGS_STORAGE_KEY) {
        const stored = getStoredTheme();
        if (stored && stored !== theme) {
          setThemeState(stored);
          applyThemeToDOM(stored);
        }
      }
    };

    const handleCustomThemeChange = (e) => {
      if (e?.detail?.theme && e.detail.theme !== theme) {
        const normalized = normalizeTheme(e.detail.theme);
        setThemeState(normalized);
        applyThemeToDOM(normalized);
      }
    };

    window.applyTheme = (mode) => setTheme(mode);

    window.addEventListener('storage', handleStorage);
    window.addEventListener('tupThemeChanged', handleCustomThemeChange);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('tupThemeChanged', handleCustomThemeChange);
      delete window.applyTheme;
    };
  }, [theme, setTheme, applyThemeToDOM]);

  const value = {
    theme,
    setTheme,
    toggleTheme,
    isDark: resolveTheme(theme) === 'dark',
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
