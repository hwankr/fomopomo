'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import TaskSidebar from './TaskSidebar';

// Hooks
import { useSettings, type Settings } from '@/components/timer/hooks/useSettings';
import { useSound } from '@/components/timer/hooks/useSound';
import { useTasks } from './timer/hooks/useTasks';
import { useTimerLogic } from './timer/hooks/useTimerLogic';
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
    updateStatus: (status, task) => updateStatus(status, task),
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

  // Fix cyclic dependency for onTimerComplete
  // We'll handle timer completion effect here instead of passing a callback that needs future declarations.
  useEffect(() => {
    if (timeLeft === 0 && !isRunning && endTimeRef.current !== 0) { // Simple check
      // But useTimerLogic handles setting it to 0.
      // Let's rely on a specific prop or state from hook if possible,
      // OR just define the function using `useCallback` with refs if we really want to pass it.
      // Actually, we can just define the logic here in an effect if `timeLeft` hits 0 and we were running.
      // BUT `useTimerLogic` stops running when it hits 0.
    }
  }, [timeLeft, isRunning]);

  // REDO: Define `handleTimerComplete` logic after hooks, and pass it to a `useEffect` here that monitors completion?
  // `useTimerLogic` calls `onTimerComplete`.
  // We can just pass an empty function and use an effect here to detect transitions.
  // OR clearer: pass the dependencies to `useTimerLogic`? No, too many.

  // Let's use a Ref for the callback!
  const onTimerCompleteRef = useCallback(() => {
    // Logic for timer completion
    if (timerMode === 'focus') {
      const duration = settings.pomoTime * 60;
      const remaining = duration - focusLoggedSeconds;
      if (remaining > 0) {
        // Trigger Save
        // We need to call generic triggerSave but that is not defined yet.
        // This is the classic specialized hook dependency hell.
        // Maybe `TimerDisplay` shouldn't be so decoupled?
        // Or maybe `TimerApp` should be the coordinator.
        // Let's define the complex logic functions *before* passing them?
        // Can't, they depend on hook state.

        // Breaking the cycle:
        // 1. `useTimerLogic` tells us "timer finished".
        // 2. `TimerApp` observes this event and acts.

        // Let's stick to the `onTimerComplete` prop but make it stable or use a Ref.
      }
      // ...
    }
    // ...
  }, [settings, focusLoggedSeconds, timerMode]); // dependencies will change

  // To solve this cleanly for now:
  // I will implement `handleTimerComplete` inside `TimerApp` and call it from an effect that watches `timeLeft`.
  // `useTimerLogic` is responsible for ticking down. When it hits 0, it stops and sets `timeLeft` to 0.
  // We can add a `didComplete` flag to `useTimerLogic`?
  // Or just check: `if (timeLeft === 0 && wasRunning)`?

  // Let's stick to the plan: `TimerApp` orchestrates.
  // We will re-implement `handleTimerComplete` inside the main body and use a `useEffect` to trigger it.

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
    localStorage.setItem("fomopomo_full_state", JSON.stringify(state));
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
  }, [timerMode, settings, focusLoggedSeconds, cycleCount, triggerSave, playAlarm, setFocusLoggedSeconds, setCycleCount, setTimerMode, setTimeLeft, setIsRunning, setIntervals]);

  // Watch for completion via Hook's internal state or callback override
  // We passed a no-op to useTimerLogic. Now we detect edge case:
  useEffect(() => {
    // If we could modify useTimerLogic to accept a Ref, that would be best.
    // Or we just check `timeLeft === 0` and `wasRunning`?
    // Since useTimerLogic sets `isRunning` to false when it hits 0...
    // We need a stable signal.
  }, []);

  // Actually, let's redefine useTimerLogic Props to accept the full callback, 
  // and we wrap the definition in a transparent component or use UseEffect separation.
  // BUT the simplest way right now is to pass `handleTimerComplete` to `useTimerLogic` by RE-RENDERING `TimerApp` when it changes. 
  // Since `handleTimerComplete` depends on `settings` which changes rarely, it's fine.
  // The issue is `handleTimerComplete` depends on `triggerSave` which depends on `saveRecord`...
  // It's a valid dependency chain.
  // The only issue is `useTimerLogic` is called *before* `handleTimerComplete` is defined.
  // We can't hoist `handleTimerComplete` before the hooks it uses.

  // FIX: Use a `useEffect` in `TimerApp` to listen to an `isComplete` state from `useTimerLogic`?
  // No, `useTimerLogic` should just call a ref.

  const timerCompleteRef = useCallback(() => {
    handleTimerComplete();
  }, [handleTimerComplete]); // This waits for `handleTimerComplete` to be defined? No, this is circular if used in hook.

  // Update the ref handler whenever `handleTimerComplete` changes
  useEffect(() => {
    onTimerCompleteCallback.current = handleTimerComplete;
  }, [handleTimerComplete]);


  const {
    timerMode: _tm, // shadowing
    // ... we need to destructure again or move the hook call down? 
    // functionality of hooks must be at top level.
  } = { timerMode }; // Dummy

  // Real usage with ref:
  // We need to alter `useTimerLogic` call above to use `timeoutHandlerRef.handler()`.


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

  const handleChangeTimerMode = (mode: any) => {
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
      const savedStateJson = localStorage.getItem("fomopomo_full_state");
      if (savedStateJson) {
        try {
          const state = JSON.parse(savedStateJson);
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
              setIntervals(state.intervals.filter((i: any) => i.start > 0 && i.end > 0));
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
  }, [setTimerMode, setCycleCount, setFocusLoggedSeconds, setTimeLeft, setIsRunning, endTimeRef, setIsStopwatchRunning, setStopwatchTime, stopwatchStartTimeRef, setIntervals, setSelectedTaskId, setSelectedTask, isLoggedIn]);

  // Server Sync Effect - Separate from local restore to handle async nature cleanly
  useEffect(() => {
    if (!isLoggedIn) return;

    const syncServerState = async () => {
      try {
        const data = await checkActiveSession();
        if (data?.status === 'studying' && data.study_start_time) {
          const startTime = new Date(data.study_start_time).getTime();
          const now = Date.now();
          const elapsed = Math.floor((now - startTime) / 1000);

          if (elapsed >= 0) {
            // Found active session on server!
            setTab('stopwatch');
            setStopwatchTime(elapsed);
            setIsStopwatchRunning(true);
            stopwatchStartTimeRef.current = startTime;
            currentIntervalStartRef.current = now; // Start tracking new interval from sync moment
            
            setIntervals([]);
            toast.success('다른 기기에서 진행 중인 스톱워치를 불러왔습니다.', { icon: '🔄' });
          }
        } else if (data?.total_stopwatch_time && data.total_stopwatch_time > 0) {
          // Found paused session on server
          // Only restore if we don't have a local active session (which we shouldn't on fresh load if we prioritize server)
          // But check if local storage has something newer? 
          // For now, assume server 'paused' state with time > 0 is worth restoring.
          
          setTab('stopwatch');
          setStopwatchTime(data.total_stopwatch_time);
          setIsStopwatchRunning(false);
          setIntervals([]);
        }
      } catch (e) {
        console.error('Sync failed', e);
      }
    };
    
    syncServerState();
  }, [isLoggedIn, checkActiveSession, setTab, setStopwatchTime, setIsStopwatchRunning, stopwatchStartTimeRef, currentIntervalStartRef, setIntervals]);




  // Persist Task
  useEffect(() => {
    localStorage.setItem("fomopomo_task_state", JSON.stringify({ taskId: selectedTaskId, taskTitle: selectedTask }));
  }, [selectedTaskId, selectedTask]);

  // Keyboard
  useEffect(() => {
    const handleSpaceToggle = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isFormField = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || target?.isContentEditable;
      if (isFormField || taskModalOpen) return;
      event.preventDefault();
      if (tab === 'timer') handleToggleTimer();
      else handleToggleStopwatch();
    };
    window.addEventListener('keydown', handleSpaceToggle);
    return () => window.removeEventListener('keydown', handleSpaceToggle);
  }, [tab, taskModalOpen, isRunning, isStopwatchRunning, timeLeft, stopwatchTime, intervals]);

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
                onResetTimer={() => { resetTimerManual(); setIntervals([]); saveState(tab, timerMode, false, timerMode === 'focus' ? settings.pomoTime * 60 : (timerMode === 'shortBreak' ? settings.shortBreak * 60 : settings.longBreak * 60), null, cycleCount, timerMode === 'focus' ? 0 : focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null, [], null); }}
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
