'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, '0')}:${s
      .toString()
      .padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

interface TimerAppProps {
  settingsUpdated: number;
  onRecordSaved: () => void; // ✨ [추가] 저장 완료 콜백 타입
  isLoggedIn: boolean;
}

type Preset = {
  id: string;
  label: string;
  minutes: number;
};

type SavedState = {
  activeTab: "timer" | "stopwatch";
  timer: {
    mode: "focus" | "shortBreak" | "longBreak";
    targetTime: number | null; // 멈추지 않고 흐르기 위한 '목표 시간' (Timestamp)
    timeLeft: number;          // 일시정지 시 저장할 '남은 시간'
    isRunning: boolean;
    cycleCount: number;
    loggedSeconds: number;     // 현재 사이클에서 이미 저장한 집중 시간(중복 저장 방지)
  };
  stopwatch: {
    startTime: number | null;  // 멈추지 않고 흐르기 위한 '시작 시간' (Timestamp)
    elapsed: number;           // 일시정지 시 저장할 '흐른 시간'
    isRunning: boolean;
  };
  lastUpdated: number;
};

// ✨ props에 onRecordSaved 추가
export default function TimerApp({
  settingsUpdated,
  onRecordSaved,
  isLoggedIn,
}: TimerAppProps) {
  const [tab, setTab] = useState<'timer' | 'stopwatch'>('timer');
  const [timerMode, setTimerMode] = useState<
    'focus' | 'shortBreak' | 'longBreak'
  >('focus');

  const [isSaving, setIsSaving] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [focusLoggedSeconds, setFocusLoggedSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isRunningRef = useRef(false);

  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const stopwatchRef = useRef<NodeJS.Timeout | null>(null);

  const endTimeRef = useRef<number>(0);
  const stopwatchStartTimeRef = useRef<number>(0);
  const mainBgRef = useRef<{
    background: string;
    backgroundColor: string;
    backgroundImage: string;
  } | null>(null);

  const [settings, setSettings] = useState({
    pomoTime: 25,
    shortBreak: 5,
    longBreak: 15,
    autoStartBreaks: false,
    autoStartPomos: false,
    longBreakInterval: 4,
    volume: 50,
    isMuted: false,
    taskPopupEnabled: true,
    tasks: ['국어', '수학', '영어'],
    presets: [
      { id: '1', label: '작업1', minutes: 25 },
      { id: '2', label: '작업2', minutes: 50 },
      { id: '3', label: '작업3', minutes: 90 },
    ] as Preset[],
  });

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState('');
  const [pendingRecord, setPendingRecord] = useState<
    { mode: string; duration: number; onAfterSave?: () => void } | null
  >(null);

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
    sStart: number | null
  ) => {
    const state: SavedState = {
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
      lastUpdated: Date.now(),
    };
    localStorage.setItem("pomofomo_full_state", JSON.stringify(state));
  }, []);

  useEffect(() => {
    const load = () => {
      // 1. 설정 불러오기
      const savedSettings = localStorage.getItem("pomofomo_settings");
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        setSettings((prev) => ({
          ...prev,
          ...parsed,
          taskPopupEnabled:
            parsed.taskPopupEnabled ?? prev.taskPopupEnabled ?? true,
          tasks:
            parsed.tasks && parsed.tasks.length > 0
              ? parsed.tasks
              : prev.tasks,
          presets:
            parsed.presets && parsed.presets.length > 0
              ? parsed.presets
              : prev.presets,
        }));
      }

      // 2. 타이머/스톱워치 상태 복구하기
      const savedStateJson = localStorage.getItem("pomofomo_full_state");
      if (savedStateJson) {
        try {
          const state: SavedState = JSON.parse(savedStateJson);
          const now = Date.now();

          // 하루(24시간) 이상 지난 기록은 무시
          if (now - state.lastUpdated < 24 * 60 * 60 * 1000) {
            setTab(state.activeTab);
            
            // [타이머 복구]
            setTimerMode(state.timer.mode);
            setCycleCount(state.timer.cycleCount);
            setFocusLoggedSeconds(state.timer.loggedSeconds || 0);

            if (state.timer.isRunning && state.timer.targetTime) {
              // 실행 중이었다면: 목표 시간 - 현재 시간 = 남은 시간
              const diff = Math.ceil((state.timer.targetTime - now) / 1000);
              if (diff > 0) {
                setTimeLeft(diff);
                setIsRunning(true);
                endTimeRef.current = state.timer.targetTime; // Ref 복구 필수
              } else {
                setTimeLeft(0); // 이미 시간 지남
                setIsRunning(true); // 종료 로직 실행을 위해 true로 설정
              }
            } else {
              // 멈춰 있었다면: 저장된 시간 그대로 복구
              setTimeLeft(state.timer.timeLeft);
              setIsRunning(false);
            }

            // [스톱워치 복구]
            if (state.stopwatch.isRunning && state.stopwatch.startTime) {
              // 실행 중이었다면: 현재 시간 - 시작 시간 = 흐른 시간
              const elapsed = Math.floor((now - state.stopwatch.startTime) / 1000);
              setStopwatchTime(elapsed);
              setIsStopwatchRunning(true);
              stopwatchStartTimeRef.current = state.stopwatch.startTime; // Ref 복구 필수
            } else {
            setStopwatchTime(state.stopwatch.elapsed);
            setIsStopwatchRunning(false);
          }
            
            if (state.timer.isRunning || state.stopwatch.isRunning) {
                toast.success("이전 작업을 복구했습니다.");
            }
          }
        } catch (e) {
          console.error("상태 복구 실패:", e);
        }
      }
      setIsLoaded(true);
    };
    load();
  }, [settingsUpdated]); // 의존성

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    const defaultTitle = 'Pomofomo';
    const modeLabel =
      timerMode === 'focus'
        ? 'Focus'
        : timerMode === 'shortBreak'
        ? 'Short Break'
        : 'Long Break';

    const timerTitle = `${formatTime(timeLeft)} - ${modeLabel} | Pomofomo`;
    const stopwatchTitle = `${formatTime(stopwatchTime)} - Stopwatch | Pomofomo`;

    if (isRunning) {
      document.title = timerTitle;
      return;
    } else if (isStopwatchRunning) {
      document.title = stopwatchTitle;
      return;
    }

    if (tab === 'timer') {
      document.title = timerTitle;
      return;
    }

    if (tab === 'stopwatch') {
      document.title = stopwatchTitle;
      return;
    }

    document.title = defaultTitle;
  }, [isRunning, timeLeft, timerMode, isStopwatchRunning, stopwatchTime, tab]);

  useEffect(() => {
    return () => {
      document.title = 'Pomofomo';
    };
  }, []);

  const persistSettings = useCallback(async (newSettings: typeof settings) => {
    localStorage.setItem('pomofomo_settings', JSON.stringify(newSettings));
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('user_settings')
          .upsert({ user_id: user.id, settings: newSettings });
      }
    } catch (error) {
      console.error('설정 저장 실패:', error);
    }
  }, []);

  const playAlarm = useCallback(() => {
    if (settings.isMuted) return;
    try {
      const audio = new Audio('/alarm.mp3');
      audio.volume = settings.volume / 100;
      audio.play();
    } catch (error) {
      console.error(error);
    }
  }, [settings.isMuted, settings.volume]);

  // ✨ onRecordSaved 사용
  const saveRecord = useCallback(
    async (recordMode: string, duration: number, taskText = '') => {
      if (duration < 10) {
        toast.error('10초 미만은 저장되지 않습니다.');
        return;
      }

      const formatDurationForToast = (totalSeconds: number) => {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        if (minutes === 0) return `${seconds}초`;
        if (seconds === 0) return `${minutes}분`;
        return `${minutes}분 ${seconds}초`;
      };

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setIsSaving(true);
      const toastId = toast.loading('기록 저장 중...', {
        style: {
          borderRadius: '10px',
          background: '#333',
          color: '#fff',
          fontSize: '14px',
        },
      });

      try {
        const { error } = await supabase.from('study_sessions').insert({
          mode: recordMode,
          duration,
          user_id: user.id,
          task: taskText.trim() || null,
        });
        if (error) throw error;

        toast.success(`${formatDurationForToast(duration)} 기록 저장 완료!`, { id: toastId });

        // ✨ [추가] 부모에게 알림 -> HistoryList 새로고침
        onRecordSaved();
      } catch (error) {
        console.error(error);
        const missingColumnMessage =
          error instanceof Error && error.message.includes('column "task"')
            ? 'Supabase에서 study_sessions 테이블에 task(TEXT) 컬럼을 추가해주세요.'
            : '저장 실패';
        toast.error(missingColumnMessage, { id: toastId });
      } finally {
        setIsSaving(false);
      }
    },
    [onRecordSaved]
  ); // ✅ 의존성 추가

  const triggerSave = useCallback(
    async (
      recordMode: string,
      duration: number,
      onAfterSave?: () => void
    ) => {
      if (duration < 10) {
        toast.error('10초 미만은 저장되지 않습니다.');
        return;
      }

      if (!isLoggedIn) {
        toast.error('로그인이 필요한 기능입니다.');
        return;
      }

      if (settings.taskPopupEnabled) {
        setPendingRecord({ mode: recordMode, duration, onAfterSave });
        setSelectedTask('');
        setTaskModalOpen(true);
      } else {
        await saveRecord(recordMode, duration);
        if (onAfterSave) onAfterSave();
      }
    },
    [saveRecord, settings.taskPopupEnabled, settings.tasks]
  );

  const handleTaskSubmit = useCallback(async () => {
    if (!pendingRecord) return;
    await saveRecord(pendingRecord.mode, pendingRecord.duration, selectedTask);
    if (pendingRecord.onAfterSave) pendingRecord.onAfterSave();
    setTaskModalOpen(false);
    setPendingRecord(null);
    setSelectedTask('');
  }, [pendingRecord, saveRecord, selectedTask]);

  const handleTaskSkip = useCallback(async () => {
    if (!pendingRecord) return;
    await saveRecord(pendingRecord.mode, pendingRecord.duration);
    if (pendingRecord.onAfterSave) pendingRecord.onAfterSave();
    setTaskModalOpen(false);
    setPendingRecord(null);
    setSelectedTask('');
  }, [pendingRecord, saveRecord]);

  const handleDisableTaskPopup = useCallback(async () => {
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
  }, [pendingRecord, persistSettings, saveRecord, selectedTask, settings]);

  const savePartialProgress = useCallback(() => {
    const fullTime =
      timerMode === 'focus'
        ? settings.pomoTime * 60
        : timerMode === 'shortBreak'
        ? settings.shortBreak * 60
        : settings.longBreak * 60;

    if (timerMode !== 'focus') return;

    const elapsed = fullTime - timeLeft;
    const additionalSeconds = elapsed - focusLoggedSeconds;

    if (additionalSeconds > 0 && timeLeft > 0) {
      triggerSave('pomo', additionalSeconds);
      setFocusLoggedSeconds(elapsed);
    }
  }, [timerMode, settings, timeLeft, triggerSave, focusLoggedSeconds]);

  const handleTimerSave = useCallback(() => {
    const fullTime =
      timerMode === 'focus'
        ? settings.pomoTime * 60
        : timerMode === 'shortBreak'
        ? settings.shortBreak * 60
        : settings.longBreak * 60;

    if (timerMode !== 'focus') return;

    const elapsed = fullTime - timeLeft;
    const additionalSeconds = elapsed - focusLoggedSeconds;

    if (additionalSeconds > 0) {
      triggerSave('pomo', additionalSeconds);
      setFocusLoggedSeconds(elapsed);
      saveState(
        tab,
        timerMode,
        isRunning,
        timeLeft,
        null,
        cycleCount,
        elapsed,
        isStopwatchRunning,
        stopwatchTime,
        null
      );
    }
  }, [
    tab,
    timerMode,
    settings,
    timeLeft,
    focusLoggedSeconds,
    triggerSave,
    isRunning,
    cycleCount,
    isStopwatchRunning,
    stopwatchTime,
    saveState,
  ]);

  const playClickSound = useCallback(() => {
    if (settings.isMuted) return;
    try {
      const audio = new Audio('/click.mp3');
      audio.volume = settings.volume / 100;
      audio.play();
    } catch (error) {
      console.error(error);
    }
  }, [settings.isMuted, settings.volume]);

  const toggleTimer = useCallback((forceStart = false) => {
    if (!forceStart && isStopwatchRunning) {
      toast.error("스톱워치가 작동 중입니다.\n먼저 정지해주세요.");
      return;
    }

    // ✨ 클릭 사운드 재생
    playClickSound();

    if (!forceStart && isRunning) {
      // [정지]
      if (timerRef.current) clearInterval(timerRef.current);
      setIsRunning(false);
      // 💾 정지 상태 저장 (현재 남은 시간)
      saveState(tab, timerMode, false, timeLeft, null, cycleCount, focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null);
    } else {
      // [시작]
      const target = Date.now() + (timeLeft * 1000);
      endTimeRef.current = target;
      setIsRunning(true);
      // 💾 실행 상태 저장 (목표 종료 시간)
      saveState(tab, timerMode, true, timeLeft, target, cycleCount, focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null);

      timerRef.current = setInterval(() => {
        const now = Date.now();
        const diff = Math.ceil((endTimeRef.current - now) / 1000);
        if (diff <= 0) setTimeLeft(0);
        else setTimeLeft(diff);
      }, 200);
    }
  }, [isStopwatchRunning, isRunning, timeLeft, timerMode, cycleCount, saveState, tab, stopwatchTime, focusLoggedSeconds, playClickSound]);

  useEffect(() => {
    if (timeLeft <= 0 && isRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      setIsRunning(false);

      playAlarm();

      if (timerMode === 'focus') {
        const duration = settings.pomoTime * 60;
        const remaining = duration - focusLoggedSeconds;

        if (remaining > 0) {
          triggerSave('pomo', remaining);
        }
        setFocusLoggedSeconds(0);

        const newCycle = cycleCount + 1;
        setCycleCount(newCycle);

        if (newCycle % settings.longBreakInterval === 0) {
          setTimerMode('longBreak');
          setTimeLeft(settings.longBreak * 60);
          toast('🎉 긴 휴식 시간입니다!', { icon: '☕' });
          if (settings.autoStartBreaks)
            setTimeout(() => toggleTimer(true), 1000);
        } else {
          setTimerMode('shortBreak');
          setTimeLeft(settings.shortBreak * 60);
          toast('잠시 휴식하세요.', { icon: '☕' });
          if (settings.autoStartBreaks)
            setTimeout(() => toggleTimer(true), 1000);
        }
      } else {
        setTimerMode('focus');
        setTimeLeft(settings.pomoTime * 60);
        setFocusLoggedSeconds(0);
        toast('다시 집중할 시간입니다!', { icon: '🔥' });
        if (settings.autoStartPomos) setTimeout(() => toggleTimer(true), 1000);
      }
    }
  }, [
    timeLeft,
    isRunning,
    timerMode,
    settings,
    cycleCount,
    playAlarm,
    toggleTimer,
    triggerSave,
    focusLoggedSeconds,
  ]);

  const changeTimerMode = (mode: "focus" | "shortBreak" | "longBreak") => {
    savePartialProgress();
    if (isRunning) {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsRunning(false);
    }
    setTimerMode(mode);
    
    // 모드 변경 시 시간 설정 및 저장
    let newTime = 0;
    if (mode === "focus") newTime = settings.pomoTime * 60;
    else if (mode === "shortBreak") newTime = settings.shortBreak * 60;
    else newTime = settings.longBreak * 60;

    setTimeLeft(newTime);
    if (mode === 'focus') setFocusLoggedSeconds(0);

    // 💾 변경된 모드 상태 저장
    saveState(tab, mode, false, newTime, null, cycleCount, mode === 'focus' ? 0 : focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null);
  };

  const handlePresetClick = (minutes: number) => {
    if (isRunning) {
        toast.error("타이머가 작동 중입니다.\n먼저 정지해주세요.");
        return;
    }
    
    setTimerMode("focus");
    setTimeLeft(minutes * 60);
    setFocusLoggedSeconds(0);
    setSettings(prev => ({ ...prev, pomoTime: minutes }));

    // 💾 프리셋 변경 저장
    saveState(tab, "focus", false, minutes * 60, null, cycleCount, 0, isStopwatchRunning, stopwatchTime, null);
    toast.success(`${minutes === 0.1 ? '5초' : minutes + '분'}으로 설정됨`);
  };

  const toggleStopwatch = useCallback(() => {
    if (isRunning) {
      toast.error("뽀모도로 타이머가 작동 중입니다.\n먼저 정지해주세요.");
      return;
    }

    // ✨ 클릭 사운드 재생
    playClickSound();

    if (isStopwatchRunning) {
      // [정지]
      if (stopwatchRef.current) clearInterval(stopwatchRef.current);
      setIsStopwatchRunning(false);
      // 💾 정지 상태 저장 (현재 흐른 시간)
      saveState(tab, timerMode, isRunning, timeLeft, null, cycleCount, focusLoggedSeconds, false, stopwatchTime, null);
    } else {
      // [시작]
      // 시작 시간 = 현재 시간 - 이미 흐른 시간
      const start = Date.now() - (stopwatchTime * 1000);
      stopwatchStartTimeRef.current = start;
      setIsStopwatchRunning(true);
      // 💾 실행 상태 저장 (시작 시간)
      saveState(tab, timerMode, isRunning, timeLeft, null, cycleCount, focusLoggedSeconds, true, stopwatchTime, start);

      stopwatchRef.current = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - stopwatchStartTimeRef.current) / 1000);
        setStopwatchTime(elapsed);
      }, 200);
    }
  }, [isRunning, isStopwatchRunning, saveState, tab, timerMode, timeLeft, cycleCount, focusLoggedSeconds, stopwatchTime, playClickSound]);

  const handleStopwatchSave = async () => {
    setIsStopwatchRunning(false);
    if (stopwatchRef.current) clearInterval(stopwatchRef.current);

    const afterSave = () => {
      setStopwatchTime(0);
      saveState(
        tab,
        timerMode,
        isRunning,
        timeLeft,
        null,
        cycleCount,
        focusLoggedSeconds,
        false,
        0,
        null
      );
    };

    await triggerSave('stopwatch', stopwatchTime, afterSave);
  };

  const resetStopwatch = () => {
    setIsStopwatchRunning(false);
    setStopwatchTime(0);
    if (stopwatchRef.current) clearInterval(stopwatchRef.current);
  };

  const resetTimerManual = () => {
    savePartialProgress();
    setIsRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);

    let resetTime = 0;
    if (timerMode === "focus") resetTime = settings.pomoTime * 60;
    else if (timerMode === "shortBreak") resetTime = settings.shortBreak * 60;
    else resetTime = settings.longBreak * 60;

    setTimeLeft(resetTime);
    if (timerMode === 'focus') setFocusLoggedSeconds(0);
    // 💾 초기화 상태 저장
    saveState(tab, timerMode, false, resetTime, null, cycleCount, timerMode === 'focus' ? 0 : focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (stopwatchRef.current) clearInterval(stopwatchRef.current);
    };
  }, []);

  useEffect(() => {
    const handleSpaceToggle = (event: KeyboardEvent) => {
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
      if (tab === 'timer') toggleTimer();
      else toggleStopwatch();
    };

    window.addEventListener('keydown', handleSpaceToggle);
    return () => window.removeEventListener('keydown', handleSpaceToggle);
  }, [tab, toggleStopwatch, toggleTimer, taskModalOpen]);

  const getThemeStyles = () => {
    if (tab === 'stopwatch') {
      return {
        bgLight: 'bg-indigo-50',
        bgDark: 'dark:bg-indigo-950/30',
        textMain: 'text-indigo-500 dark:text-indigo-400',
        btnMain: 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-200',
        modeBtnActive: 'bg-indigo-500 text-white border-indigo-500 shadow-sm',
        glowFrom: 'from-indigo-200/70 via-indigo-100/50',
        glowTo: 'to-indigo-400/40',
        ring: 'ring-indigo-200/80 dark:ring-indigo-400/40 ring-offset-4 ring-offset-white dark:ring-offset-slate-900',
        overlayFrom: 'from-indigo-200/40',
        overlayTo: 'to-indigo-900/30',
      };
    }

    if (timerMode === 'shortBreak' || timerMode === 'longBreak') {
      return {
        bgLight: 'bg-emerald-50',
        bgDark: 'dark:bg-emerald-950/30',
        textMain: 'text-emerald-500 dark:text-emerald-400',
        btnMain: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200',
        modeBtnActive: 'bg-emerald-500 text-white border-emerald-500 shadow-sm',
        glowFrom: 'from-emerald-200/70 via-emerald-100/50',
        glowTo: 'to-emerald-400/40',
        ring: 'ring-emerald-200/80 dark:ring-emerald-400/40 ring-offset-4 ring-offset-white dark:ring-offset-slate-900',
        overlayFrom: 'from-emerald-200/40',
        overlayTo: 'to-emerald-900/30',
      };
    }

    return {
      bgLight: 'bg-rose-50',
      bgDark: 'dark:bg-rose-950/30',
      textMain: 'text-rose-500 dark:text-rose-400',
      btnMain: 'bg-rose-500 hover:bg-rose-600 shadow-rose-200',
      modeBtnActive: 'bg-rose-500 text-white border-rose-500 shadow-sm',
      glowFrom: 'from-rose-200/70 via-rose-100/50',
      glowTo: 'to-rose-400/40',
      ring: 'ring-rose-200/80 dark:ring-rose-400/40 ring-offset-4 ring-offset-white dark:ring-offset-slate-900',
      overlayFrom: 'from-rose-200/40',
      overlayTo: 'to-rose-900/30',
    };
  };

  const theme = getThemeStyles();
  const isAnyRunning = isRunning || isStopwatchRunning;

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
      if (mainBgRef.current) {
        mainEl.style.background = mainBgRef.current.background;
        mainEl.style.backgroundColor = mainBgRef.current.backgroundColor;
        mainEl.style.backgroundImage = mainBgRef.current.backgroundImage;
      }
    };
  }, [isRunning, isStopwatchRunning, tab, timerMode]);

  const modeBtnBase =
    'px-2 py-2 sm:px-5 sm:py-2 rounded-full text-xs sm:text-sm font-bold border-2 transition-all whitespace-nowrap flex-1 sm:flex-none';
  const modeBtnInactive =
    'text-gray-400 border-transparent hover:bg-black/5 dark:hover:bg-white/5';

  const currentMaxTime =
    timerMode === 'focus'
      ? settings.pomoTime * 60
      : timerMode === 'shortBreak'
      ? settings.shortBreak * 60
      : settings.longBreak * 60;

  const showReset = timeLeft !== currentMaxTime;
  const focusElapsed = timerMode === 'focus' ? currentMaxTime - timeLeft : 0;
  const showFocusSaveButton =
    timerMode === 'focus' && !isRunning && focusElapsed - focusLoggedSeconds > 0;

  return (
    <>
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div
            className="absolute inset-0"
            onClick={handleTaskSkip}
            role="button"
            aria-label="close task memo"
          ></div>
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 w-full max-w-md overflow-hidden">
            <div className="flex items-start justify-between p-5 border-b border-gray-100 dark:border-slate-700">
              <div>
                <div className="text-sm font-bold text-gray-800 dark:text-gray-100">어떤 작업을 했나요?</div>
                <p className="text-xs text-gray-500 mt-1">
                  설정에서 만들어 둔 작업 목록을 선택하면 Report에서 통계가 깨끗하게 모여요.
                </p>
              </div>
              <button
                onClick={handleTaskSkip}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="내용 없이 저장"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-200">
                  작업 선택
                </label>
                <div className="space-y-2">
                  <select
                    value={selectedTask}
                    onChange={(e) => setSelectedTask(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 px-3 py-3 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-rose-300 dark:focus:ring-rose-500"
                  >
                    <option value="">작업 없음</option>
                    {settings.tasks.map((task) => (
                      <option key={task} value={task}>
                        {task}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500">
                    작업은 설정 &gt; 작업 목록에서 추가·수정할 수 있어요. 미리 정해 둔 이름을 써야 Report에 일관되게 집계돼요.
                  </p>
                </div>
              </div>
              <div className="flex items-start justify-between gap-3 text-[11px] text-gray-400">
                <div className="space-y-1">
                  <button
                    onClick={handleDisableTaskPopup}
                    className="text-[11px] text-gray-500 dark:text-gray-300 underline underline-offset-4"
                  >
                    자동 팝업 끄기
                  </button>
                  <p>자동 팝업은 설정에서 다시 킬 수 있어요.</p>
                </div>
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={handleTaskSkip}
                    className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-slate-600"
                  >
                    내용 없이 저장
                  </button>
                  <button
                    onClick={handleTaskSubmit}
                    disabled={isSaving}
                    className="px-3 py-2 rounded-lg bg-rose-500 text-white font-bold shadow-sm hover:bg-rose-600 disabled:opacity-60"
                  >
                    작업 저장
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative w-full max-w-md mx-auto">
        <div
          className={`absolute -inset-4 rounded-[2.5rem] blur-3xl transition-all duration-700 pointer-events-none -z-10 bg-gradient-to-br ${theme.glowFrom} ${theme.glowTo} ${
            isAnyRunning ? 'opacity-80 scale-100' : 'opacity-0 scale-95'
          }`}
        />
        <div
          className={`relative w-full bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden transition-all duration-300 transform ${
            isAnyRunning ? `ring-2 ${theme.ring} shadow-2xl scale-[1.02]` : ''
          }`}
        >
      <div className="flex p-1 bg-gray-100 dark:bg-slate-900/50 m-2 rounded-2xl">
        <button
          onClick={() => setTab('timer')}
          className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${
            tab === 'timer'
              ? 'bg-white dark:bg-slate-800 text-gray-700 dark:text-white shadow-sm'
              : 'text-gray-400 dark:text-gray-500'
          }`}
        >
          타이머
        </button>
        <button
          onClick={() => setTab('stopwatch')}
          className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${
            tab === 'stopwatch'
              ? 'bg-white dark:bg-slate-800 text-gray-700 dark:text-white shadow-sm'
              : 'text-gray-400 dark:text-gray-500'
          }`}
        >
          스톱워치
        </button>
      </div>

      <div
          className={`px-6 py-8 sm:px-10 sm:py-10 flex flex-col items-center justify-center min-h-[360px] transition-colors duration-500 ${theme.bgLight} ${theme.bgDark}`}
      >
        {!isLoaded ? (
          <div className="text-gray-400 animate-pulse text-sm">
            설정 불러오는 중...
          </div>
        ) : tab === 'timer' ? (
          <div className="text-center animate-fade-in w-full">
            <div className="flex justify-center gap-1 sm:gap-2 mb-6 w-full">
              <button
                onClick={() => changeTimerMode('focus')}
                className={`${modeBtnBase} ${
                  timerMode === 'focus' ? theme.modeBtnActive : modeBtnInactive
                }`}
              >
                뽀모도로
              </button>
              <button
                onClick={() => changeTimerMode('shortBreak')}
                className={`${modeBtnBase} ${
                  timerMode === 'shortBreak'
                    ? theme.modeBtnActive
                    : modeBtnInactive
                }`}
              >
                짧은 휴식
              </button>
              <button
                onClick={() => changeTimerMode('longBreak')}
                className={`${modeBtnBase} ${
                  timerMode === 'longBreak'
                    ? theme.modeBtnActive
                    : modeBtnInactive
                }`}
              >
                긴 휴식
              </button>
            </div>

            <div
              className={`text-7xl sm:text-8xl font-bold mb-4 font-mono tracking-tighter transition-colors ${theme.textMain}`}
            >
              {formatTime(timeLeft)}
            </div>

            <div className="flex flex-wrap gap-2 justify-center mb-6">
              {settings.presets &&
                settings.presets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetClick(preset.minutes)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-white dark:bg-slate-700 text-gray-600 dark:text-gray-300 shadow-sm border border-gray-200 dark:border-slate-600 hover:border-rose-300 dark:hover:border-rose-500 hover:text-rose-500 transition-all active:scale-95 whitespace-nowrap"
                  >
                    {preset.label}
                  </button>
                ))}
            </div>

            {timerMode === 'focus' && (
              <div className="text-sm font-bold text-gray-400 dark:text-gray-500 mb-6 opacity-90 tracking-wider">
                사이클 {cycleCount} / {settings.longBreakInterval}
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={() => toggleTimer()}
                className={`px-10 py-4 rounded-2xl font-bold text-lg text-white transition-all active:scale-95 shadow-lg ${theme.btnMain} dark:shadow-none min-w-[140px]`}
              >
                {isRunning ? '일시정지' : '시작'}
              </button>

              {showFocusSaveButton && (
                <button
                  onClick={handleTimerSave}
                  disabled={isSaving}
                  className="px-5 py-4 rounded-2xl font-bold text-white bg-gray-800 hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm"
                >
                  저장
                </button>
              )}

              {!isRunning && showReset && (
                <button
                  onClick={resetTimerManual}
                  className="p-4 rounded-2xl bg-white dark:bg-slate-700 text-gray-400 border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 transition-all animate-fade-in shadow-sm"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                    className="w-6 h-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center animate-fade-in w-full">
            <div className="mb-6 text-sm font-bold text-indigo-400 uppercase tracking-widest">
              스톱워치
            </div>

            <div className="text-7xl sm:text-8xl font-bold mb-10 font-mono tracking-tighter text-indigo-500 dark:text-indigo-400">
              {formatTime(stopwatchTime)}
            </div>

            <div className="flex gap-4 justify-center items-center">
              <button
                onClick={toggleStopwatch}
                className="px-10 py-4 rounded-2xl font-bold text-lg text-white bg-indigo-500 hover:bg-indigo-600 shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95 min-w-[140px]"
              >
                {isStopwatchRunning ? '일시정지' : '시작'}
              </button>

              {!isStopwatchRunning && stopwatchTime > 0 && (
                <>
                  <button
                    onClick={handleStopwatchSave}
                    disabled={isSaving}
                    className="px-5 py-4 rounded-2xl font-bold text-white bg-gray-800 hover:bg-black transition-all shadow-sm"
                  >
                    저장
                  </button>
                  <button
                    onClick={resetStopwatch}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-700 text-gray-400 border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 transition-all shadow-sm"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                      className="w-6 h-6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3"
                      />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
        </div>
      </div>
    </>
  );
}
