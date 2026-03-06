'use client';

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react';

type ThemeContextType = {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEME_KEY = 'theme';

function getThemeSnapshot() {
  if (typeof window === 'undefined') {
    return false;
  }

  const savedTheme = window.localStorage.getItem(THEME_KEY);
  if (savedTheme === 'dark') return true;
  if (savedTheme === 'light') return false;

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function subscribeTheme(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleThemeChange = () => onStoreChange();
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === THEME_KEY) {
      onStoreChange();
    }
  };

  mediaQuery.addEventListener('change', handleThemeChange);
  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('themeChanged', handleThemeChange);

  return () => {
    mediaQuery.removeEventListener('change', handleThemeChange);
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener('themeChanged', handleThemeChange);
  };
}

function writeTheme(isDarkMode: boolean) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(THEME_KEY, isDarkMode ? 'dark' : 'light');
  window.dispatchEvent(new Event('themeChanged'));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const isDarkMode = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    () => false
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    writeTheme(!isDarkMode);
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
