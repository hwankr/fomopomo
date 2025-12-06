import { useEffect, useRef } from 'react';

type TimerMode = 'focus' | 'shortBreak' | 'longBreak';

interface ThemeBackgroundProps {
  tab: 'timer' | 'stopwatch';
  timerMode: TimerMode;
  isRunning: boolean;
  isStopwatchRunning: boolean;
}

export const ThemeBackground = ({
  tab,
  timerMode,
  isRunning,
  isStopwatchRunning,
}: ThemeBackgroundProps) => {
  const mainBgRef = useRef<{
    background: string;
    backgroundColor: string;
    backgroundImage: string;
  } | null>(null);

  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (!mainEl) return;

    if (!mainBgRef.current) {
      mainBgRef.current = {
        background: mainEl.style.background,
        backgroundColor: mainEl.style.backgroundColor,
        backgroundImage: mainEl.style.backgroundImage,
      };
    }

    const isTimerRunning = isRunning && tab === 'timer';
    const isStopwatchActive = isStopwatchRunning && tab === 'stopwatch';
    
    if (isTimerRunning || isStopwatchActive) {
      const isDark =
        document.documentElement.classList.contains('dark') ||
        mainEl.classList.contains('dark');
      
      const lightBg = tab === 'stopwatch'
        ? '#e0e7ff' // indigo-100-ish
        : timerMode === 'focus'
          ? '#fff1f2' // rose-50
          : '#ecfdf3'; // emerald-50
      
      const darkBg = tab === 'stopwatch'
        ? '#1e1b4b' // indigo-950-ish
        : timerMode === 'focus'
          ? '#2b0f1c' // rose-950-ish
          : '#042f2e'; // emerald-950-ish

      mainEl.style.backgroundImage = '';
      mainEl.style.backgroundColor = isDark ? darkBg : lightBg;
    } else if (mainBgRef.current) {
      mainEl.style.background = mainBgRef.current.background;
      mainEl.style.backgroundColor = mainBgRef.current.backgroundColor;
      mainEl.style.backgroundImage = mainBgRef.current.backgroundImage;
    }

    return () => {
      // Clean up handled in next effect run or component unmount, but ideally we restore on unmount too
      // However logic here is a bit tricky if multiple instances exist (unlikely).
      // Let's rely on the restoration logic above when `isAnyRunning` becomes false.
      if (mainBgRef.current && !isTimerRunning && !isStopwatchActive) {
          mainEl.style.background = mainBgRef.current.background;
          mainEl.style.backgroundColor = mainBgRef.current.backgroundColor;
          mainEl.style.backgroundImage = mainBgRef.current.backgroundImage;
      }
    };
  }, [isRunning, isStopwatchRunning, tab, timerMode]);

  const getThemeStyles = () => {
    if (tab === 'stopwatch') {
      return {
        bgLight: 'bg-indigo-50',
        bgDark: 'dark:bg-indigo-950/30',
        textMain: 'text-indigo-500 dark:text-indigo-400',
        glowFrom: 'from-indigo-200/70 via-indigo-100/50',
        glowTo: 'to-indigo-400/40',
        ring: 'ring-indigo-200/80 dark:ring-indigo-400/40 ring-offset-4 ring-offset-white dark:ring-offset-slate-900',
      };
    }

    if (timerMode === 'shortBreak' || timerMode === 'longBreak') {
      return {
        bgLight: 'bg-emerald-50',
        bgDark: 'dark:bg-emerald-950/30',
        textMain: 'text-emerald-500 dark:text-emerald-400',
        glowFrom: 'from-emerald-200/70 via-emerald-100/50',
        glowTo: 'to-emerald-400/40',
        ring: 'ring-emerald-200/80 dark:ring-emerald-400/40 ring-offset-4 ring-offset-white dark:ring-offset-slate-900',
      };
    }

    return {
      bgLight: 'bg-rose-50',
      bgDark: 'dark:bg-rose-950/30',
      textMain: 'text-rose-500 dark:text-rose-400',
      glowFrom: 'from-rose-200/70 via-rose-100/50',
      glowTo: 'to-rose-400/40',
      ring: 'ring-rose-200/80 dark:ring-rose-400/40 ring-offset-4 ring-offset-white dark:ring-offset-slate-900',
    };
  };

  const theme = getThemeStyles();
  const isAnyRunning = isRunning || isStopwatchRunning;

  return (
    <>
      <div
        className={`absolute -inset-4 rounded-[2.5rem] blur-3xl transition-all duration-700 pointer-events-none -z-10 bg-gradient-to-br ${theme.glowFrom} ${theme.glowTo} ${isAnyRunning ? 'opacity-80 scale-100' : 'opacity-0 scale-95'}`}
      />
      
      {/* Background panel that sits behind content */}
      <div className={`absolute inset-0 rounded-[2rem] transition-colors duration-500 ${theme.bgLight} ${theme.bgDark} -z-10`} />
      
      {/* Outer Glow Ring Effect applied to parent usually, but here we can just expose styles or return fragments. 
          The original code applied classes to the main container. 
          Here we might need to pass `theme` back up or wrap content. 
          For now, this component renders the absolute positioned glow effects.
      */}
    </>
  );
};

// Helper to get theme class names for consumption by other components
export const getThemeColors = (tab: 'timer' | 'stopwatch', timerMode: TimerMode) => {
    if (tab === 'stopwatch') {
      return {
        textMain: 'text-indigo-500 dark:text-indigo-400',
        btnMain: 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-200',
        modeBtnActive: 'bg-indigo-500 text-white border-indigo-500 shadow-sm',
      };
    }
    if (timerMode === 'shortBreak' || timerMode === 'longBreak') {
      return {
        textMain: 'text-emerald-500 dark:text-emerald-400',
        btnMain: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200',
        modeBtnActive: 'bg-emerald-500 text-white border-emerald-500 shadow-sm',
      };
    }
    return {
      textMain: 'text-rose-500 dark:text-rose-400',
      btnMain: 'bg-rose-500 hover:bg-rose-600 shadow-rose-200',
      modeBtnActive: 'bg-rose-500 text-white border-rose-500 shadow-sm',
    };
};

export const getContainerStyles = (isRunning: boolean, isStopwatchRunning: boolean, tab: 'timer'|'stopwatch', timerMode: TimerMode) => {
    const isAnyRunning = isRunning || isStopwatchRunning;
    let ringClass = '';
    
    if (tab === 'stopwatch') ringClass = 'ring-indigo-200/80 dark:ring-indigo-400/40';
    else if (timerMode === 'focus') ringClass = 'ring-rose-200/80 dark:ring-rose-400/40';
    else ringClass = 'ring-emerald-200/80 dark:ring-emerald-400/40';

    return isAnyRunning 
        ? `ring-2 ${ringClass} ring-offset-4 ring-offset-white dark:ring-offset-slate-900 shadow-2xl scale-[1.02]` 
        : '';
}
