'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import TaskSidebar from './TaskSidebar';

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

  const toastShownRef = useRef(false); // ✨ [New] Toast guard

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
    presets: [
      { id: '1', label: '작업1', minutes: 25 },
      { id: '2', label: '작업2', minutes: 50 },
      { id: '3', label: '작업3', minutes: 90 },
    ] as Preset[],
  });

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null); // ✨ [New] Selected Task ID
  const [isTaskSidebarOpen, setIsTaskSidebarOpen] = useState(false); // ✨ [New] Sidebar State
  const [dbTasks, setDbTasks] = useState<{ id: string; title: string }[]>([]); // ✨ [New] Tasks from DB
  const [weeklyPlans, setWeeklyPlans] = useState<{ id: string; title: string }[]>([]); // ✨ [New] Weekly Plans from DB
  const [monthlyPlans, setMonthlyPlans] = useState<{ id: string; title: string }[]>([]); // ✨ [New] Monthly Plans from DB
  const [pendingRecord, setPendingRecord] = useState<
    { mode: string; duration: number; onAfterSave?: () => void } | null
  >(null);

  // ✨ [New] Fetch tasks from DB
  const fetchDbTasks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = format(new Date(), 'yyyy-MM-dd');

      // Fetch daily tasks
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('id, title')
        .eq('user_id', user.id)
        .eq('due_date', today)
        .neq('status', 'done');

      if (tasksData) {
        setDbTasks(tasksData);
      }

      // ✨ [New] Fetch weekly plans
      const { data: weeklyData } = await supabase
        .from('weekly_plans')
        .select('id, title')
        .eq('user_id', user.id)
        .neq('status', 'done');

      if (weeklyData) {
        setWeeklyPlans(weeklyData);
      }

      // ✨ [New] Fetch monthly plans
      const { data: monthlyData } = await supabase
        .from('monthly_plans')
        .select('id, title')
        .eq('user_id', user.id)
        .neq('status', 'done');

      if (monthlyData) {
        setMonthlyPlans(monthlyData);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  // ✨ [New] Helper to get selected task title from all lists
  const getSelectedTaskTitle = () => {
    const task =
      dbTasks.find((t) => t.id === selectedTaskId) ||
      weeklyPlans.find((t) => t.id === selectedTaskId) ||
      monthlyPlans.find((t) => t.id === selectedTaskId);
    return task?.title || '';
  };

  useEffect(() => {
    fetchDbTasks();

    // 포커스 시 최신화 (선택 사항)
    const onFocus = () => fetchDbTasks();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []); // ✨ Mount 시 실행

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

  // 1. Load Settings
  useEffect(() => {
    const savedSettings = localStorage.getItem("pomofomo_settings");
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setSettings((prev) => ({
        ...prev,
        ...parsed,
        taskPopupEnabled:
          parsed.taskPopupEnabled ?? prev.taskPopupEnabled ?? true,
        presets:
          parsed.presets && parsed.presets.length > 0
            ? parsed.presets
            : prev.presets,
      }));
    }
  }, [settingsUpdated]);

  // 2. Restore State (Mount only)
  useEffect(() => {
    const restoreState = () => {
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

            if ((state.timer.isRunning || state.stopwatch.isRunning) && !toastShownRef.current) {
              toast.success("이전 작업을 복구했습니다.");
              toastShownRef.current = true;
            }
          }
        } catch (e) {
          console.error("상태 복구 실패:", e);
        }
      }
      setIsLoaded(true);
    };
    restoreState();
  }, []); // Run once on mount

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
          task_id: selectedTaskId, // ✨ [New] Save task_id
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

      // ✨ [수정] 이미 태스크가 선택되어 있다면 팝업 없이 바로 저장 (설정에 따라 다를 수 있음)
      // 여기서는 "팝업 사용 안함" 설정이거나, 태스크가 이미 선택된 경우 바로 저장하도록 수정
      if (settings.taskPopupEnabled && !selectedTaskId) {
        setPendingRecord({ mode: recordMode, duration, onAfterSave });
        setSelectedTask('');
        // setSelectedTaskId(null); // 기존 선택 유지
        setTaskModalOpen(true);
      } else {
        // 태스크가 선택되어 있거나 팝업이 비활성화된 경우
        await saveRecord(recordMode, duration, selectedTask); // selectedTask에는 제목이 들어있음
        if (onAfterSave) onAfterSave();
      }
    },
    [saveRecord, settings.taskPopupEnabled, selectedTaskId, selectedTask] // ✨ 의존성 추가
  );

  const handleTaskSubmit = useCallback(async () => {
    if (!pendingRecord) return;
    await saveRecord(pendingRecord.mode, pendingRecord.duration, selectedTask);
    if (pendingRecord.onAfterSave) pendingRecord.onAfterSave();
    setTaskModalOpen(false);
    setPendingRecord(null);
    setSelectedTask('');
    setSelectedTaskId(null);
  }, [pendingRecord, saveRecord, selectedTask, selectedTaskId]);

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

  // ✨ [New] Timer Interval Effect
  useEffect(() => {
    if (isRunning) {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          const now = Date.now();
          const diff = Math.ceil((endTimeRef.current - now) / 1000);
          if (diff <= 0) setTimeLeft(0);
          else setTimeLeft(diff);
        }, 200);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning]);

  // ✨ [New] Stopwatch Interval Effect
  useEffect(() => {
    if (isStopwatchRunning) {
      if (!stopwatchRef.current) {
        stopwatchRef.current = setInterval(() => {
          const now = Date.now();
          const elapsed = Math.floor((now - stopwatchStartTimeRef.current) / 1000);
          setStopwatchTime(elapsed);
        }, 200);
      }
    } else {
      if (stopwatchRef.current) {
        clearInterval(stopwatchRef.current);
        stopwatchRef.current = null;
      }
    }

    return () => {
      if (stopwatchRef.current) {
        clearInterval(stopwatchRef.current);
        stopwatchRef.current = null;
      }
    };
  }, [isStopwatchRunning]);

  const toggleTimer = useCallback((forceStart = false) => {
    if (!forceStart && isStopwatchRunning) {
      toast.error("스톱워치가 작동 중입니다.\n먼저 정지해주세요.");
      return;
    }

    // ✨ 클릭 사운드 재생
    playClickSound();

    if (!forceStart && isRunning) {
      // [정지]
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
    }
  }, [isStopwatchRunning, isRunning, timeLeft, timerMode, cycleCount, saveState, tab, stopwatchTime, focusLoggedSeconds, playClickSound]);

  useEffect(() => {
    if (timeLeft <= 0 && isRunning) {
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
    }
  }, [isRunning, isStopwatchRunning, saveState, tab, timerMode, timeLeft, cycleCount, focusLoggedSeconds, stopwatchTime, playClickSound]);

  const handleStopwatchSave = async () => {
    setIsStopwatchRunning(false);

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
  };

  const resetTimerManual = () => {
    savePartialProgress();
    setIsRunning(false);

    let resetTime = 0;
    if (timerMode === "focus") resetTime = settings.pomoTime * 60;
    else if (timerMode === "shortBreak") resetTime = settings.shortBreak * 60;
    else resetTime = settings.longBreak * 60;

    setTimeLeft(resetTime);
    if (timerMode === 'focus') setFocusLoggedSeconds(0);
    // 💾 초기화 상태 저장
    saveState(tab, timerMode, false, resetTime, null, cycleCount, timerMode === 'focus' ? 0 : focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null);
  };

  // Cleanup intervals on unmount is handled by useEffect now
  // useEffect(() => {
  //   return () => {
  //     if (timerRef.current) clearInterval(timerRef.current);
  //     if (stopwatchRef.current) clearInterval(stopwatchRef.current);
  //   };
  // }, []);

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden scale-100 transition-transform duration-200">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
                What did you focus on?
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Select a task from your list or enter a new one.
              </p>

              <div className="space-y-4">
                {/* ✨ [New] DB Tasks List */}
                {dbTasks.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Today's Tasks</p>
                    <div className="grid gap-2">
                      {dbTasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => {
                            setSelectedTask(task.title);
                            setSelectedTaskId(task.id);
                          }}
                          className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${selectedTaskId === task.id
                            ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                            : 'bg-gray-50 dark:bg-slate-700/50 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700'
                            }`}
                        >
                          {task.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                    Or type manually
                  </label>
                  <input
                    type="text"
                    value={selectedTask}
                    onChange={(e) => {
                      setSelectedTask(e.target.value);
                      setSelectedTaskId(null); // Clear ID if typing manually
                    }}
                    placeholder="e.g. Reading, Coding..."
                    className="w-full bg-gray-50 dark:bg-slate-900 border-2 border-gray-100 dark:border-slate-700 rounded-xl px-4 py-3 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:border-rose-500 dark:focus:border-rose-500 transition-colors"
                    autoFocus
                  />
                </div>

                {/* Legacy Presets Removed */}
              </div>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={handleTaskSkip}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700 transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={handleTaskSubmit}
                  disabled={!selectedTask.trim()}
                  className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-rose-500/30 transition-all"
                >
                  Save
                </button>
              </div>

              <button
                onClick={handleDisableTaskPopup}
                className="w-full mt-4 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline decoration-gray-300 underline-offset-2 transition-colors"
              >
                Don't ask me again
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative w-full max-w-md mx-auto">
        <div
          className={`absolute -inset-4 rounded-[2.5rem] blur-3xl transition-all duration-700 pointer-events-none -z-10 bg-gradient-to-br ${theme.glowFrom} ${theme.glowTo} ${isAnyRunning ? 'opacity-80 scale-100' : 'opacity-0 scale-95'
            }`}
        />
        <div
          className={`relative w-full bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden transition-all duration-300 transform ${isAnyRunning ? `ring-2 ${theme.ring} shadow-2xl scale-[1.02]` : ''
            }`}
        >
          <div className="flex items-center gap-2 m-2">
            <div className="flex-1 flex p-1 bg-gray-100 dark:bg-slate-900/50 rounded-2xl">
              <button
                onClick={() => setTab('timer')}
                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${tab === 'timer'
                  ? 'bg-white dark:bg-slate-800 text-gray-700 dark:text-white shadow-sm'
                  : 'text-gray-400 dark:text-gray-500'
                  }`}
              >
                타이머
              </button>
              <button
                onClick={() => setTab('stopwatch')}
                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${tab === 'stopwatch'
                  ? 'bg-white dark:bg-slate-800 text-gray-700 dark:text-white shadow-sm'
                  : 'text-gray-400 dark:text-gray-500'
                  }`}
              >
                스톱워치
              </button>
            </div>

            <button
              onClick={() => setIsTaskSidebarOpen(true)}
              className={`p-4 rounded-2xl transition-all shadow-sm border active:scale-95 ${selectedTaskId
                ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400 border-rose-100 dark:border-rose-900/50'
                : 'bg-white dark:bg-slate-800 text-gray-400 dark:text-gray-500 border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              title="Select Task"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 17.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                />
              </svg>
            </button>

            <TaskSidebar
              isOpen={isTaskSidebarOpen}
              onClose={() => setIsTaskSidebarOpen(false)}
              tasks={dbTasks}
              weeklyPlans={weeklyPlans}
              monthlyPlans={monthlyPlans} // ✨ [New] Pass monthly plans
              selectedTaskId={selectedTaskId}
              onSelectTask={(task) => {
                if (task) {
                  setSelectedTask(task.title);
                  setSelectedTaskId(task.id);
                } else {
                  setSelectedTask('');
                  setSelectedTaskId(null);
                }
              }}
            />
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
                    className={`${modeBtnBase} ${timerMode === 'focus' ? theme.modeBtnActive : modeBtnInactive
                      }`}
                  >
                    뽀모도로
                  </button>
                  <button
                    onClick={() => changeTimerMode('shortBreak')}
                    className={`${modeBtnBase} ${timerMode === 'shortBreak'
                      ? theme.modeBtnActive
                      : modeBtnInactive
                      }`}
                  >
                    짧은 휴식
                  </button>
                  <button
                    onClick={() => changeTimerMode('longBreak')}
                    className={`${modeBtnBase} ${timerMode === 'longBreak'
                      ? theme.modeBtnActive
                      : modeBtnInactive
                      }`}
                  >
                    긴 휴식
                  </button>
                </div>

                {/* ✨ [New] Selected Task Display */}
                <div className={`w-full max-w-xs mx-auto relative z-20 flex justify-center transition-all duration-300 ${selectedTaskId ? 'mb-6 min-h-[24px]' : 'mb-0 h-0'}`}>
                  {selectedTaskId && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50 animate-fade-in">
                      <span className="text-sm font-medium max-w-[200px] truncate">
                        {getSelectedTaskTitle()}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedTaskId(null);
                          setSelectedTask('');
                        }}
                        className="p-0.5 hover:bg-rose-100 dark:hover:bg-rose-800/50 rounded-full transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-4 h-4"
                        >
                          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                      </button>
                    </div>
                  )}
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

                {/* ✨ [New] Selected Task Display for Stopwatch */}
                <div className={`w-full max-w-xs mx-auto relative z-20 flex justify-center transition-all duration-300 ${selectedTaskId ? 'mb-6 min-h-[24px]' : 'mb-0 h-0'}`}>
                  {selectedTaskId && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 animate-fade-in">
                      <span className="text-sm font-medium max-w-[200px] truncate">
                        {getSelectedTaskTitle()}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedTaskId(null);
                          setSelectedTask('');
                        }}
                        className="p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-800/50 rounded-full transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="w-4 h-4"
                        >
                          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                        </svg>
                      </button>
                    </div>
                  )}
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
