'use client';

import { useState, useCallback, useEffect, useEffectEvent, useRef } from 'react';
import toast from 'react-hot-toast';
import TaskSidebar from './TaskSidebar';

// Hooks
import { useSettings, type Settings } from '@/components/timer/hooks/useSettings';
import { useSound } from '@/components/timer/hooks/useSound';
import { useTasks } from './timer/hooks/useTasks';
import { useTimerLogic, type TimerMode } from './timer/hooks/useTimerLogic';
import { useStopwatchLogic } from './timer/hooks/useStopwatchLogic';
import { useStudySession } from './timer/hooks/useStudySession';

// UI Components
import { TaskModal } from './timer/ui/TaskModal';
import { TimerDisplay } from './timer/ui/TimerDisplay';
import { StopwatchDisplay } from './timer/ui/StopwatchDisplay';
import { ThemeBackground } from './timer/ui/ThemeBackground';

// Helper to format time for Tab Title
const formatTimeForTitle = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

interface TimerAppProps {
  settingsUpdated: number;
  onRecordSaved: () => void;
  isLoggedIn: boolean;
}

type SavedInterval = {
  start: number;
  end: number;
};

type SavedTimerState = {
  mode: TimerMode;
  isRunning: boolean;
  timeLeft: number;
  targetTime: number | null;
  cycleCount: number;
  loggedSeconds: number;
};

type SavedStopwatchState = {
  isRunning: boolean;
  elapsed: number;
  startTime: number | null;
};

type SavedAppState = {
  activeTab: 'timer' | 'stopwatch';
  timer: SavedTimerState;
  stopwatch: SavedStopwatchState;
  intervals?: SavedInterval[];
  currentIntervalStart?: number | null;
  lastUpdated: number;
};

const normalizeTimerMode = (value: string | null | undefined): TimerMode => {
  if (value === 'shortBreak' || value === 'longBreak') {
    return value;
  }
  return 'focus';
};

const getStoredValue = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.error(`Failed to read ${key} from localStorage`, error);
    return null;
  }
};

const setStoredValue = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.error(`Failed to write ${key} to localStorage`, error);
  }
};

export default function TimerApp({
  settingsUpdated,
  onRecordSaved,
  isLoggedIn,
}: TimerAppProps) {
  const [tab, setTab] = useState<'timer' | 'stopwatch'>('timer');
  const [isTaskSidebarOpen, setIsTaskSidebarOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  // Pending record state for manual save popup
  const [pendingRecord, setPendingRecord] = useState<{
    mode: string;
    duration: number;
    onAfterSave?: () => void;
  } | null>(null);

  // 1. Settings Hook
  const { settings, setSettings, persistSettings } = useSettings(settingsUpdated);

  // 2. Sound Hook
  const { playAlarm, playClickSound } = useSound({
    volume: settings.volume,
    isMuted: settings.isMuted,
  });

  // 3. Tasks Hook
  const {
    dbTasks,
    weeklyPlans,
    monthlyPlans,
    selectedTask,
    selectedTaskId,
    setSelectedTask,
    setSelectedTaskId,
    getSelectedTaskTitle,
  } = useTasks(isLoggedIn);

  // 4. Study Session Hook
  const {
    isSaving,
    intervals,
    setIntervals,
    currentIntervalStartRef,
    updateStatus,
    saveRecord,
    checkActiveSession,
  } = useStudySession({
    isLoggedIn,
    onRecordSaved,
    selectedTaskId,
    selectedTaskTitle: getSelectedTaskTitle() || selectedTask,
  });

  // 4.5. Callback Ref for Timer Completion (Must be defined before useTimerLogic)
  // We need to use a Ref because handleTimerComplete depends on state that changes,
  // but we want the callback passed to useTimerLogic to be stable to prevent interval resets.
  const onTimerCompleteCallback = useRef<() => void>(() => { });

  // 5. Timer Logic Hook
  const {
    timerMode,
    timeLeft,
    isRunning,
    cycleCount,
    focusLoggedSeconds,
    setTimerMode,
    setTimeLeft,
    setIsRunning,
    setCycleCount,
    setFocusLoggedSeconds,
    toggleTimer,
    resetTimerManual,
    changeTimerMode,
    endTimeRef
  } = useTimerLogic({
    settings,
    onTimerCompleteRef: onTimerCompleteCallback,
    playClickSound,
    updateStatus: (status, task, startTime, elapsed, timerType, timerMode, timerDuration) => updateStatus(status, task, startTime, elapsed, timerType, timerMode, timerDuration),
  });

  // 6. Stopwatch Logic Hook
  const {
    stopwatchTime,
    isStopwatchRunning,
    setIsStopwatchRunning,
    setStopwatchTime,
    toggleStopwatch,
    resetStopwatch,
    stopwatchStartTimeRef,
  } = useStopwatchLogic({
    playClickSound,
    updateStatus: (status, task, startTime, elapsed) => updateStatus(status, task, startTime, elapsed),
  });

  // --- Persistence Logic ---
  const saveState = useCallback((
    currentTab: "timer" | "stopwatch",
    tMode: "focus" | "shortBreak" | "longBreak",
    tRunning: boolean,
    tLeft: number,
    tTarget: number | null,
    cycle: number,
    tLogged: number,
    sRunning: boolean,
    sElapsed: number,
    sStart: number | null,
    currentIntervals: { start: number; end: number }[],
    currentStart: number | null // NEW PARAMETER
  ) => {
    const state = {
      activeTab: currentTab,
      timer: {
        mode: tMode,
        isRunning: tRunning,
        timeLeft: tLeft,
        targetTime: tTarget,
        cycleCount: cycle,
        loggedSeconds: tLogged,
      },
      stopwatch: {
        isRunning: sRunning,
        elapsed: sElapsed,
        startTime: sStart,
      },
      intervals: currentIntervals,
      currentIntervalStart: currentStart, // SAVE IT
      lastUpdated: Date.now(),
    };
    setStoredValue("fomopomo_full_state", JSON.stringify(state));
  }, []);

  // --- Handlers ---

  // Saving Logic Helper
  const triggerSave = useCallback(async (recordMode: string, duration: number, onAfterSave?: () => void, forcedEndTime?: number) => {
    // Prevent duplicate trigger if already saving
    if (isSaving) {
      console.log('[triggerSave] Already saving, ignoring duplicate request');
      return;
    }

    if (duration < 10) {
      toast.error('10초 미만은 저장되지 않습니다.');
      return;
    }
    if (!isLoggedIn) {
      toast.error('로그인이 필요한 기능입니다.');
      return;
    }

    if (settings.taskPopupEnabled && !selectedTaskId) {
      setPendingRecord({ mode: recordMode, duration, onAfterSave });
      setTaskModalOpen(true);
    } else {
      await saveRecord(recordMode, duration, selectedTask, forcedEndTime);
      if (onAfterSave) onAfterSave();
    }
  }, [isSaving, isLoggedIn, settings.taskPopupEnabled, selectedTaskId, selectedTask, saveRecord]);

  const handleTimerComplete = useCallback(() => {
    // Play alarm (handled in useEffect/hook but let's make sure)
    playAlarm();

    if (timerMode === 'focus') {
      const duration = settings.pomoTime * 60;
      const remaining = duration - focusLoggedSeconds;

      if (remaining > 0) {
        // Pass endTimeRef.current as forcedEndTime to ensure exact recording time
        const forcedEndTime = endTimeRef.current > 0 ? endTimeRef.current : undefined;
        triggerSave('pomo', remaining, undefined, forcedEndTime);
      }
      setFocusLoggedSeconds(0);

      const newCycle = cycleCount + 1;
      setCycleCount(newCycle);

      if (newCycle % settings.longBreakInterval === 0) {
        setTimerMode('longBreak');
        setTimeLeft(settings.longBreak * 60);
        toast('🎉 긴 휴식 시간입니다!', { icon: '☕' });
        if (settings.autoStartBreaks) setTimeout(() => {
          setIsRunning(true);
          // Need to sync intervals/state here too?
          // Simple start is handled by `setIsRunning` but persistence logic needs to trigger.
          // This is where hook separation gets tricky. 
          // The hook toggleTimer handles `isRunning` state, but we need to wrap it for persistence.
          // We'll assume manual toggle for now or simple auto-start without persistence until next tick?
          // No, we need persistence.
          // Let's call the wrapper `handleToggleTimer()` but we can't from here easily without refs.
        }, 1000);
      } else {
        setTimerMode('shortBreak');
        setTimeLeft(settings.shortBreak * 60);
        toast('잠시 휴식하세요.', { icon: '☕' });
        if (settings.autoStartBreaks) setTimeout(() => {
          setIsRunning(true);
        }, 1000);
      }
    } else {
      // 긴 휴식 완료 후 focus로 돌아올 때 사이클 리셋
      if (timerMode === 'longBreak') {
        setCycleCount(0);
      }
      setTimerMode('focus');
      setTimeLeft(settings.pomoTime * 60);
      setFocusLoggedSeconds(0);
      toast('다시 집중할 시간입니다!', { icon: '🔥' });
      if (settings.autoStartPomos) setTimeout(() => {
        setIsRunning(true);
      }, 1000);
    }

    // ✨ Push Notification Trigger
    if ('serviceWorker' in navigator && Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(registration => {
        const title = timerMode === 'focus' ? '집중 시간 종료! ☕' : '휴식 종료! 다시 집중해볼까요? 🔥';
        const body = timerMode === 'focus'
          ? '수고하셨습니다. 잠시 머리를 식히세요.'
          : '휴식이 끝났습니다. 목표를 향해 다시 달려봐요!';

        registration.showNotification(title, {
          body,
          icon: '/icon-192x192.png',
          requireInteraction: true,
          tag: 'timer-complete',
          renotify: true,
          data: {
            url: window.location.href
          }
        } as NotificationOptions);
      });
    }

    setIntervals([]);
    // currentIntervalStartRef.current = null; // Managed by hook, but we need to reset it? Hook exposes `currentIntervalStartRef`.
  }, [timerMode, settings, focusLoggedSeconds, cycleCount, triggerSave, playAlarm, setFocusLoggedSeconds, setCycleCount, setTimerMode, setTimeLeft, setIsRunning, setIntervals, endTimeRef]);

  // Update the ref handler whenever `handleTimerComplete` changes
  useEffect(() => {
    onTimerCompleteCallback.current = handleTimerComplete;
  }, [handleTimerComplete]);


  // --- Wrappers for Toggle to handle persistence ---
  const handleToggleTimer = () => {
    if (isStopwatchRunning || stopwatchTime > 0) {
      toast.error('스톱워치 기록이 있습니다.\n먼저 스톱워치를 초기화하거나 저장해주세요.');
      return;
    }

    if (isRunning) {
      // Stopping
      let newIntervals = intervals;
      if (currentIntervalStartRef.current) {
        newIntervals = [...intervals, { start: currentIntervalStartRef.current, end: Date.now() }];
        setIntervals(newIntervals);
        currentIntervalStartRef.current = null;
      }
      saveState(tab, timerMode, false, timeLeft, null, cycleCount, focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null, newIntervals, null);
    } else {
      // Starting
      const target = Date.now() + (timeLeft * 1000);
      currentIntervalStartRef.current = Date.now();
      saveState(tab, timerMode, true, timeLeft, target, cycleCount, focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null, intervals, currentIntervalStartRef.current);
    }
    toggleTimer();
  };

  const handleToggleStopwatch = () => {
    const fullTime = timerMode === 'focus' ? settings.pomoTime * 60 : timerMode === 'shortBreak' ? settings.shortBreak * 60 : settings.longBreak * 60;
    const hasTimerProgress = !isRunning && timeLeft < fullTime && timeLeft > 0;

    if (isRunning || (timerMode === 'focus' && focusLoggedSeconds > 0) || hasTimerProgress) {
      toast.error('타이머 기록이 있습니다.\n먼저 타이머를 초기화하거나 저장해주세요.');
      return;
    }

    if (isStopwatchRunning) {
      // Stopping
      let newIntervals = intervals;
      if (currentIntervalStartRef.current) {
        newIntervals = [...intervals, { start: currentIntervalStartRef.current, end: Date.now() }];
        setIntervals(newIntervals);
        currentIntervalStartRef.current = null;
      }
      saveState(tab, timerMode, isRunning, timeLeft, null, cycleCount, focusLoggedSeconds, false, stopwatchTime, null, newIntervals, null);
    } else {
      // Starting
      const start = Date.now() - (stopwatchTime * 1000);
      currentIntervalStartRef.current = Date.now();
      saveState(tab, timerMode, isRunning, timeLeft, null, cycleCount, focusLoggedSeconds, true, stopwatchTime, start, intervals, currentIntervalStartRef.current);
    }
    toggleStopwatch();
  };

  const handleChangeTimerMode = (mode: TimerMode) => {
    if (timerMode === 'focus' && focusLoggedSeconds > 0) {
      const fullTime = settings.pomoTime * 60;
      const elapsed = fullTime - timeLeft;
      const additional = elapsed - focusLoggedSeconds;
      if (additional > 0 && timeLeft > 0) {
        triggerSave('pomo', additional);
      }
    }

    changeTimerMode(mode);
    setIntervals([]);
    saveState(tab, mode, false, timeLeft, null, cycleCount, mode === 'focus' ? 0 : focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null, [], null);
  };

  const handlePresetClick = (minutes: number) => {
    if (isStopwatchRunning || stopwatchTime > 0) {
      toast.error('스톱워치 기록이 있습니다.\n먼저 스톱워치를 초기화하거나 저장해주세요.');
      return;
    }
    if (isRunning) {
      toast.error("타이머가 작동 중입니다.\n먼저 정지해주세요.");
      return;
    }
    setTimerMode("focus");
    setTimeLeft(minutes * 60);
    setFocusLoggedSeconds(0);
    setSettings((prev: Settings) => ({ ...prev, pomoTime: minutes }));
    setIntervals([]);
    saveState(tab, "focus", false, minutes * 60, null, cycleCount, 0, isStopwatchRunning, stopwatchTime, null, [], null);
    toast.success(`${minutes === 0.1 ? '5초' : minutes + '분'}으로 설정됨`);
  };

  const handleSaveTimer = () => {
    const fullTime = timerMode === 'focus' ? settings.pomoTime * 60 : timerMode === 'shortBreak' ? settings.shortBreak * 60 : settings.longBreak * 60;
    const elapsed = fullTime - timeLeft;
    const additional = elapsed - focusLoggedSeconds;

    if (additional > 0) {
      const afterSave = () => {
        resetTimerManual();
        setIntervals([]);
        saveState(tab, timerMode, false, fullTime, null, cycleCount, 0, isStopwatchRunning, stopwatchTime, null, [], null);
        updateStatus('online', undefined, undefined, 0, 'timer', timerMode, 0);
      };
      triggerSave('pomo', additional, afterSave);
    }
  };

  const handleSaveStopwatch = async () => {
    // Capture current interval before stopping (if running)
    if (isStopwatchRunning && currentIntervalStartRef.current) {
      const newInterval = { start: currentIntervalStartRef.current, end: Date.now() };
      setIntervals(prev => [...prev, newInterval]);
      currentIntervalStartRef.current = null;
    }

    setIsStopwatchRunning(false);
    const afterSave = () => {
      setStopwatchTime(0);
      setIntervals([]);
      currentIntervalStartRef.current = null;
      saveState(tab, timerMode, isRunning, timeLeft, null, cycleCount, focusLoggedSeconds, false, 0, null, [], null);
      // Clear server state
      updateStatus('online', undefined, undefined, 0);
    };
    await triggerSave('stopwatch', stopwatchTime, afterSave);
  };

  const handleResetStopwatch = () => {
    resetStopwatch();
    setIntervals([]);
    currentIntervalStartRef.current = null;
    saveState(tab, timerMode, isRunning, timeLeft, null, cycleCount, focusLoggedSeconds, false, 0, null, [], null);
    // Clear server state
    updateStatus('online', undefined, undefined, 0);
  };

  const handleDisableTaskPopup = async () => {
    const updated = { ...settings, taskPopupEnabled: false };
    setSettings(updated);
    await persistSettings(updated);
    toast.success('자동 팝업을 끄고 바로 저장합니다. 설정에서 다시 켤 수 있어요.');
    if (pendingRecord) {
      await saveRecord(pendingRecord.mode, pendingRecord.duration, selectedTask);
      if (pendingRecord.onAfterSave) pendingRecord.onAfterSave();
      setPendingRecord(null);
      setSelectedTask('');
    }
    setTaskModalOpen(false);
  };

  const handleTaskSubmit = async () => {
    if (!pendingRecord) return;
    await saveRecord(pendingRecord.mode, pendingRecord.duration, selectedTask);
    if (pendingRecord.onAfterSave) pendingRecord.onAfterSave();
    setTaskModalOpen(false);
    setPendingRecord(null);
    setSelectedTask('');
    setSelectedTaskId(null);
  };

  const handleTaskSkip = async () => {
    if (!pendingRecord) return;
    await saveRecord(pendingRecord.mode, pendingRecord.duration);
    if (pendingRecord.onAfterSave) pendingRecord.onAfterSave();
    setTaskModalOpen(false);
    setPendingRecord(null);
    setSelectedTask('');
  };


  // --- Restore ---
  useEffect(() => {
    const restoreState = () => {
      const savedStateJson = getStoredValue("fomopomo_full_state");
      if (savedStateJson) {
        try {
          const state = JSON.parse(savedStateJson) as SavedAppState;
          const now = Date.now();
          if (now - state.lastUpdated < 24 * 60 * 60 * 1000) {
            setTab(state.activeTab);
            setTimerMode(state.timer.mode);
            setCycleCount(state.timer.cycleCount);
            setFocusLoggedSeconds(state.timer.loggedSeconds || 0);

            if (state.timer.isRunning && state.timer.targetTime) {
              const diff = Math.ceil((state.timer.targetTime - now) / 1000);
              if (diff > 0) {
                setTimeLeft(diff);
                setIsRunning(true);
                endTimeRef.current = state.timer.targetTime;
                currentIntervalStartRef.current = Date.now();
              } else {
                setTimeLeft(0);
                setIsRunning(false);
                endTimeRef.current = state.timer.targetTime;
                // Timer was already completed while away - will handle in restore complete logic
              }
            } else {
              setTimeLeft(state.timer.timeLeft);
              setIsRunning(false);
            }

            if (state.stopwatch.isRunning && state.stopwatch.startTime) {
              if (state.stopwatch.startTime > 1704067200000) {
                const elapsed = Math.floor((now - state.stopwatch.startTime) / 1000);
                setStopwatchTime(elapsed);
                setIsStopwatchRunning(true);
                stopwatchStartTimeRef.current = state.stopwatch.startTime;
                currentIntervalStartRef.current = Date.now();
              } else {
                setStopwatchTime(0);
                setIsStopwatchRunning(false);
              }
            } else {
              setStopwatchTime(state.stopwatch.elapsed);
              setIsStopwatchRunning(false);
            }

            if (state.intervals) {
              setIntervals(
                state.intervals.filter(
                  (interval) => interval.start > 0 && interval.end > 0
                )
              );
            }

            // Restore current interval start if available
            if (state.currentIntervalStart) {
              currentIntervalStartRef.current = state.currentIntervalStart;
            } else if ((state.timer.isRunning || state.stopwatch.isRunning) && !currentIntervalStartRef.current) {
              // Fallback for migration or if missing but running
              currentIntervalStartRef.current = Date.now();
            }
          }
        } catch (e) { console.error(e); }
      }

      // Sync with Server (Priority over local storage for active status)
      if (isLoggedIn) {
        // We need a way to check server status. 
        // Since useStudySession is a hook used in this component, we can use the exposed function if we added one, 
        // OR just do a direct call here if we didn't add it to the return of useStudySession yet. 
        // But we added `checkActiveSession` to useStudySession result in the previous step (conceptually).
        // Let's assume we can access it. 
        // Wait, destructuring `checkActiveSession` from `useStudySession` result at the top of component is needed first.
      }
    };
    restoreState();
  }, [setTimerMode, setCycleCount, setFocusLoggedSeconds, setTimeLeft, setIsRunning, endTimeRef, setIsStopwatchRunning, setStopwatchTime, stopwatchStartTimeRef, setIntervals, setSelectedTaskId, setSelectedTask, isLoggedIn, currentIntervalStartRef]);

  // Server Sync Effect - Separate from local restore to handle async nature cleanly
  // Ref to track if sync has been done (only sync once per mount)
  const hasSyncedRef = useRef(false);
  
  useEffect(() => {
    if (!isLoggedIn) return;
    
    // 이미 동기화 완료된 경우 스킵 (컴포넌트 마운트 시 1회만 실행)
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;

    const syncServerState = async () => {
      try {
        // 로컬에서 이미 실행 중으로 복원된 경우 확인 (로컬 스토리지에서)
        const savedState = getStoredValue("fomopomo_full_state");
        let localIsRunning = false;
        let localIsStopwatchRunning = false;
        let localElapsed = 0;
        let localTimerElapsed = 0;
        
        if (savedState) {
          try {
            const parsed = JSON.parse(savedState);
            localIsRunning = parsed.timer?.isRunning || false;
            localIsStopwatchRunning = parsed.stopwatch?.isRunning || false;
            localElapsed = parsed.stopwatch?.elapsed || 0;
            
            // 로컬에서 실행 중이었다면 startTime 기반으로 실제 경과 시간 계산
            if (localIsStopwatchRunning && parsed.stopwatch?.startTime) {
              const now = Date.now();
              localElapsed = Math.floor((now - parsed.stopwatch.startTime) / 1000);
            }
            
            // For timer, calculate elapsed from timeLeft and duration
            if (parsed.timer?.mode && parsed.timer?.timeLeft !== undefined) {
              const localMode = parsed.timer.mode;
              const localTimeLeft = parsed.timer.timeLeft;
              const localDuration = localMode === 'focus'
                ? settings.pomoTime * 60
                : localMode === 'shortBreak'
                  ? settings.shortBreak * 60
                  : settings.longBreak * 60;
              localTimerElapsed = localDuration - localTimeLeft;
              
              // 타이머가 실행 중이었다면 targetTime 기반으로 실제 남은 시간 계산
              if (localIsRunning && parsed.timer?.targetTime) {
                const now = Date.now();
                const actualRemaining = Math.max(0, Math.floor((parsed.timer.targetTime - now) / 1000));
                localTimerElapsed = localDuration - actualRemaining;
              }
            }
          } catch (e) {
            console.error('Error parsing local state for sync', e);
          }
        }
        
        // 로컬에서 이미 실행 중으로 복원된 경우, 서버 동기화 스킵
        if (localIsRunning || localIsStopwatchRunning) {
          console.log('[Sync] 로컬에서 실행 중인 세션이 복원됨. 서버 동기화 스킵.');
          return;
        }

        const data = await checkActiveSession();
        if (data?.status === 'studying' && data.study_start_time) {
          const startTime = new Date(data.study_start_time).getTime();
          const now = Date.now();
          const elapsed = Math.floor((now - startTime) / 1000);

          if (elapsed >= 0) {
            // Found active session on server!
            if (data.timer_type === 'timer') {
              // Sync Pomodoro Timer
              const mode = normalizeTimerMode(data.timer_mode);
              const duration = data.timer_duration || (mode === 'focus' ? settings.pomoTime * 60 : mode === 'shortBreak' ? settings.shortBreak * 60 : settings.longBreak * 60);

              const remaining = duration - elapsed;
              if (remaining > 0) {
                setTab('timer');
                setTimerMode(mode);
                setTimeLeft(remaining);
                setIsRunning(true);
                endTimeRef.current = now + (remaining * 1000);

                if (mode === 'focus' && elapsed === 0) setFocusLoggedSeconds(0);
                if (mode === 'focus') setFocusLoggedSeconds(elapsed);

                toast.success('다른 기기에서 진행 중인 타이머를 불러왔습니다.', { icon: '🔄' });
              }
            } else {
              // Sync Stopwatch (Default)
              setTab('stopwatch');
              setStopwatchTime(elapsed);
              setIsStopwatchRunning(true);
              stopwatchStartTimeRef.current = startTime;
              currentIntervalStartRef.current = now;

              toast.success('다른 기기에서 진행 중인 스톱워치를 불러왔습니다.', { icon: '🔄' });
            }
          }
        } else if (data?.total_stopwatch_time && data.total_stopwatch_time > 0) {
          // Found paused session - compare with local storage to prevent data loss

          if (data.timer_type === 'timer') {
            const mode = normalizeTimerMode(data.timer_mode);
            const duration = data.timer_duration || 0;
            const serverElapsed = data.total_stopwatch_time;

            // Use the larger elapsed time to prevent data loss
            const finalElapsed = Math.max(serverElapsed, localTimerElapsed);

            if (localTimerElapsed > serverElapsed) {
              console.log(`[Sync] 로컬 타이머 시간(${localTimerElapsed}s)이 DB(${serverElapsed}s)보다 큼. 로컬 값 유지.`);
            } else {
              const remaining = duration - finalElapsed;
              if (remaining > 0) {
                setTab('timer');
                setTimerMode(mode);
                setTimeLeft(remaining);
                setIsRunning(false);
                if (mode === 'focus') setFocusLoggedSeconds(finalElapsed);
              }
            }
          } else {
            // Use the larger time to prevent data loss
            const serverTime = data.total_stopwatch_time;
            const maxTime = Math.max(localElapsed, serverTime);

            if (localElapsed > serverTime) {
              console.log(`[Sync] 로컬 스톱워치 시간(${localElapsed}s)이 DB(${serverTime}s)보다 큼. 로컬 값 유지.`);
            } else if (maxTime > 0) {
              // 서버 시간이 더 클 때만 업데이트
              setTab('stopwatch');
              setStopwatchTime(maxTime);
              setIsStopwatchRunning(false);
            }
          }
        }
      } catch (e) {
        console.error('Sync failed', e);
      }
    };

    syncServerState();
  }, [isLoggedIn, checkActiveSession, setTab, setStopwatchTime, setIsStopwatchRunning, stopwatchStartTimeRef, currentIntervalStartRef, setIntervals, settings, endTimeRef, setFocusLoggedSeconds, setIsRunning, setTimeLeft, setTimerMode]);




  // Persist Task
  useEffect(() => {
    setStoredValue(
      "fomopomo_task_state",
      JSON.stringify({ taskId: selectedTaskId, taskTitle: selectedTask })
    );
  }, [selectedTaskId, selectedTask]);

  const handleSpaceToggle = useEffectEvent((event: KeyboardEvent) => {
    if (event.code !== 'Space' && event.key !== ' ') return;
    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName;
    const isFormField =
      tagName === 'INPUT' ||
      tagName === 'TEXTAREA' ||
      tagName === 'SELECT' ||
      target?.isContentEditable;
    if (isFormField || taskModalOpen) return;
    event.preventDefault();
    if (tab === 'timer') handleToggleTimer();
    else handleToggleStopwatch();
  });

  // Keyboard
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      handleSpaceToggle(event);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // Update Document Title
  useEffect(() => {
    let modeString = 'fomopomo';
    let timeString = '';

    if (tab === 'timer') {
      timeString = formatTimeForTitle(timeLeft);
      if (timerMode === 'focus') modeString = '뽀모도로';
      else if (timerMode === 'shortBreak') modeString = '짧은 휴식';
      else if (timerMode === 'longBreak') modeString = '긴 휴식';
    } else {
      timeString = formatTimeForTitle(stopwatchTime);
      modeString = '스톱워치';
    }

    document.title = `${timeString} | ${modeString}`;

    return () => {
      document.title = 'Fomopomo';
    };
  }, [tab, timerMode, timeLeft, stopwatchTime]);


  return (
    <>
      <TaskModal
        isOpen={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        dbTasks={dbTasks}
        selectedTask={selectedTask}
        selectedTaskId={selectedTaskId}
        onSelectTask={(task, id) => { setSelectedTask(task); setSelectedTaskId(id); }}
        onSave={handleTaskSubmit}
        onSkip={handleTaskSkip}
        onDisablePopup={handleDisableTaskPopup}
      />

      <div className="relative w-full max-w-md mx-auto">
        <ThemeBackground tab={tab} timerMode={timerMode} isRunning={isRunning} isStopwatchRunning={isStopwatchRunning} />
        <div className={`relative w-full bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden transition-all duration-300 transform ${(isRunning || isStopwatchRunning) ? 'shadow-2xl scale-[1.02] ring-2 ring-offset-2 dark:ring-offset-slate-900' : ''
          } ${(isRunning || isStopwatchRunning) ? (
            tab === 'stopwatch' ? 'ring-indigo-200 dark:ring-indigo-900' :
              timerMode === 'focus' ? 'ring-rose-200 dark:ring-rose-900' :
                'ring-emerald-200 dark:ring-emerald-900'
          ) : ''
          }`}>

          <div className="flex items-center gap-2 m-2">
            <div className="flex-1 flex p-1 bg-gray-100 dark:bg-slate-900/50 rounded-2xl">
              <button onClick={() => setTab('timer')} className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${tab === 'timer' ? 'bg-white dark:bg-slate-800 text-gray-700 dark:text-white shadow-sm' : 'text-gray-400 dark:text-gray-500'}`}>타이머</button>
              <button onClick={() => setTab('stopwatch')} className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${tab === 'stopwatch' ? 'bg-white dark:bg-slate-800 text-gray-700 dark:text-white shadow-sm' : 'text-gray-400 dark:text-gray-500'}`}>스톱워치</button>
            </div>
            <button onClick={() => setIsTaskSidebarOpen(true)} className={`p-4 rounded-2xl transition-all shadow-sm border active:scale-95 ${selectedTaskId ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400 border-rose-100 dark:border-rose-900/50' : 'bg-white dark:bg-slate-800 text-gray-400 dark:text-gray-500 border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 17.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
            </button>
          </div>

          <TaskSidebar isOpen={isTaskSidebarOpen} onClose={() => setIsTaskSidebarOpen(false)} tasks={dbTasks} weeklyPlans={weeklyPlans} monthlyPlans={monthlyPlans} selectedTaskId={selectedTaskId} onSelectTask={(task) => { if (task) { setSelectedTask(task.title); setSelectedTaskId(task.id); } else { setSelectedTask(''); setSelectedTaskId(null); } }} />

          <div className={`px-6 py-8 sm:px-10 sm:py-10 flex flex-col items-center justify-center min-h-[360px] transition-colors duration-500 ${tab === 'stopwatch' ? 'bg-indigo-50 dark:bg-indigo-950/30' : (timerMode === 'focus' ? 'bg-rose-50 dark:bg-rose-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30')}`}>
            {tab === 'timer' ? (
              <TimerDisplay
                timerMode={timerMode} timeLeft={timeLeft} isRunning={isRunning} isSaving={isSaving} cycleCount={cycleCount} longBreakInterval={settings.longBreakInterval} presets={settings.presets}
                showSaveButton={timerMode === 'focus' && !isRunning && (timerMode === 'focus' ? (settings.pomoTime * 60) : (timerMode === 'shortBreak' ? settings.shortBreak * 60 : settings.longBreak * 60)) - timeLeft - focusLoggedSeconds > 0}
                showResetButton={!isRunning && timeLeft !== (timerMode === 'focus' ? (settings.pomoTime * 60) : (timerMode === 'shortBreak' ? settings.shortBreak * 60 : settings.longBreak * 60))}
                onToggleTimer={handleToggleTimer}
                onResetTimer={() => {
                  resetTimerManual();
                  setIntervals([]);
                  saveState(tab, timerMode, false, timerMode === 'focus' ? settings.pomoTime * 60 : (timerMode === 'shortBreak' ? settings.shortBreak * 60 : settings.longBreak * 60), null, cycleCount, timerMode === 'focus' ? 0 : focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null, [], null);
                  updateStatus('online', undefined, undefined, 0, 'timer', timerMode, 0);
                }}
                onSaveTimer={handleSaveTimer} onChangeMode={handleChangeTimerMode} onPresetClick={handlePresetClick}
                selectedTaskId={selectedTaskId} selectedTaskTitle={getSelectedTaskTitle() || selectedTask} onOpenTaskSidebar={() => setIsTaskSidebarOpen(true)} onClearTask={(e) => { e.stopPropagation(); setSelectedTaskId(null); setSelectedTask(''); }}
              />
            ) : (
              <StopwatchDisplay stopwatchTime={stopwatchTime} isStopwatchRunning={isStopwatchRunning} isSaving={isSaving} onToggleStopwatch={handleToggleStopwatch} onSaveStopwatch={handleSaveStopwatch} onResetStopwatch={handleResetStopwatch} selectedTaskId={selectedTaskId} selectedTaskTitle={getSelectedTaskTitle() || selectedTask} onOpenTaskSidebar={() => setIsTaskSidebarOpen(true)} onClearTask={(e) => { e.stopPropagation(); setSelectedTaskId(null); setSelectedTask(''); }} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
