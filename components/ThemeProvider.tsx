'use client';

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react';

export type Theme = 'light' | 'dark' | 'spring';

type ThemeContextType = {
  theme: Theme;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEME_KEY = 'theme';

const THEME_CYCLE: Theme[] = ['light', 'dark', 'spring'];

function getThemeSnapshot(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const savedTheme = window.localStorage.getItem(THEME_KEY);
  if (savedTheme === 'dark' || savedTheme === 'spring') return savedTheme;
  if (savedTheme === 'light') return 'light';

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
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

function writeTheme(theme: Theme) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(THEME_KEY, theme);
  window.dispatchEvent(new Event('themeChanged'));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    () => 'light' as Theme
  );

  const isDarkMode = theme === 'dark';

  useEffect(() => {
    document.documentElement.classList.remove('dark', 'seasonal-spring');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'spring') {
      document.documentElement.classList.add('seasonal-spring');
    }
  }, [theme]);

  const toggleDarkMode = () => {
    const currentIndex = THEME_CYCLE.indexOf(theme);
    const nextIndex = (currentIndex + 1) % THEME_CYCLE.length;
    writeTheme(THEME_CYCLE[nextIndex]);
  };

  return (
    <ThemeContext.Provider value={{ theme, isDarkMode, toggleDarkMode }}>
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
