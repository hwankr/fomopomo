'use client';

import { useState, useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Check, Coffee, Pause, RefreshCw, Timer, TriangleAlert } from 'lucide-react';
import TaskSidebar from './TaskSidebar';
import type { BeadTone } from '@/components/ui/Beads';
import { useStudySubjects } from '@/hooks/useStudySubjects';
import { cn } from '@/lib/utils';

// Hooks
import { useSettings, type Settings } from '@/components/timer/hooks/useSettings';
import { useSound } from '@/components/timer/hooks/useSound';
import { useTasks, type TaskItem, type LongTermSubtaskItem, type LongTermTaskItem } from './timer/hooks/useTasks';
import { useTimerLogic, type TimerMode } from './timer/hooks/useTimerLogic';
import { useStopwatchLogic } from './timer/hooks/useStopwatchLogic';
import { getStopwatchSnapshot, type StopwatchSnapshot } from './timer/hooks/stopwatchUtils';
import { useStudySession, MIN_SAVABLE_SECONDS, type PendingStudyRecord, type SaveRecordResult } from './timer/hooks/useStudySession';
import { TASK_STATE_KEY, type SavedTaskState } from './timer/hooks/useTasks';
import { readSettingsSnapshot } from './timer/hooks/settingsStore';
import {
  GUEST_OWNER,
  clearForeignLegacyState,
  getCurrentUserId,
  getStorageOwner,
  readOwnedJson,
  writeOwnedJson,
} from '@/lib/userScopedStorage';

// UI Components
import { TaskModal } from './timer/ui/TaskModal';
import { TimerDisplay } from './timer/ui/TimerDisplay';
import { StopwatchDisplay } from './timer/ui/StopwatchDisplay';
import { TimerModeTabs, getTimerTabId, type TimerModeKey } from './timer/ui/TimerModeTabs';
import { TimerSettingsDialog, type TimerDurationSettings } from './timer/ui/TimerSettingsDialog';
import type { EndedPhase } from './timer/ui/timerDisplayUtils';
import { isStudySessionIdentity, newStudySessionIdentity, type StudySessionIdentity } from './timer/hooks/sessionIdentity';

// Helper to format time for Tab Title
const formatTimeForTitle = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// 페이지(무대)가 알아야 하는 타이머 상태: 실행 중인 시계의 모드 색, 최근 활동 시트를
// 접어 둘지(실행 중이거나 방금 끝났는지), 시계가 (다시) 움직이기 시작한 횟수.
// startCount가 바뀌면 페이지는 잠깐 펼쳐 둔 시트를 다시 접는다(끝남 → 다음 단계 시작 포함).
export type TimerStage = {
  tone: BeadTone | null;
  busy: boolean;
  startCount: number;
};

interface TimerAppProps {
  /** @deprecated 설정은 저장소 구독으로 바로 반영된다. */
  settingsUpdated?: number;
  onRecordSaved: () => void;
  isLoggedIn: boolean;
  /** 빠른 "타이머 설정" 창. 모바일 상단 바에서도 열 수 있게 페이지가 상태를 쥘 수 있다. */
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
  onStageChange?: (stage: TimerStage) => void;
  onOpenLogin?: () => void;
}

const TIMER_PANEL_ID = 'timer-mode-panel';

// Space 단축키가 가로채지 않을 대상: 스스로 Space에 반응하는 컨트롤.
const SPACE_INTERACTIVE_SELECTOR = [
  'button', 'a[href]', 'input', 'textarea', 'select', 'summary', '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
  '[role="switch"]', '[role="checkbox"]', '[role="radio"]',
].join(',');
// 열려 있는 대화상자·팝오버(ModalDialog는 aria-modal, Radix 팝오버·선택은 popper 래퍼).
const OPEN_LAYER_SELECTOR = '[aria-modal="true"], [data-radix-popper-content-wrapper]';

const isSpaceShortcutTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return false;
  return !target.closest(`${SPACE_INTERACTIVE_SELECTOR}, [role="dialog"], [role="alertdialog"]`);
};

type SavedInterval = {
  start: number;
  end: number;
};

type SavedTimerState = {
  mode: TimerMode;
  duration?: number;
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
  runStartTime?: number | null;
};

type SavedAppState = {
  sessionIdentity?: StudySessionIdentity | null;
  activeTab: 'timer' | 'stopwatch';
  timer: SavedTimerState;
  stopwatch: SavedStopwatchState;
  intervals?: SavedInterval[];
  currentIntervalStart?: number | null;
  taskHandoff?: TaskHandoff | null;
  // Full durations (seconds) configured when this snapshot was written. Lets
  // the restore effect tell an untouched idle timer (timeLeft === the full
  // duration of ITS OWN settings era) apart from partial progress, so a
  // settings change between save and restore can re-sync the idle display
  // instead of resurrecting the stale duration. Absent on legacy snapshots.
  configuredDurations?: Record<TimerMode, number>;
  lastUpdated: number;
  ownerUserId?: string;
};

type TaskHandoff = {
  task: TaskItem;
  completionPending: boolean;
};

const normalizeTimerMode = (value: string | null | undefined): TimerMode => {
  if (value === 'shortBreak' || value === 'longBreak') {
    return value;
  }
  return 'focus';
};

const isValidInterval = (interval: { start: number; end: number }) =>
  interval.start > 0 && interval.end > 0;

const closeStopwatchIntervals = (
  intervals: SavedInterval[], currentStart: number | null, endTime: number
) => {
  const closed = intervals
    .filter(interval => isValidInterval(interval) && interval.start < endTime)
    .map(interval => ({ start: interval.start, end: Math.min(interval.end, endTime) }));
  if (currentStart !== null && currentStart < endTime) {
    closed.push({ start: currentStart, end: endTime });
  }
  return closed;
};

// 토스트 아이콘: 이모지 대신 18px 선 아이콘을 토큰 색으로 쓴다(성공·실패는 Toaster 기본 아이콘).
const toastIcons = {
  autoPause: <Pause aria-hidden="true" size={18} strokeWidth={2} className="shrink-0 text-watch" />,
  warning: <TriangleAlert aria-hidden="true" size={18} strokeWidth={2} className="shrink-0 text-pomo-deep" />,
  rest: <Coffee aria-hidden="true" size={18} strokeWidth={2} className="shrink-0 text-rest" />,
  focus: <Timer aria-hidden="true" size={18} strokeWidth={2} className="shrink-0 text-pomo" />,
  completed: <Check aria-hidden="true" size={18} strokeWidth={2} className="shrink-0 text-rest" />,
  refresh: <RefreshCw aria-hidden="true" size={18} strokeWidth={2} className="shrink-0 text-ink-muted" />,
};

const notifyStopwatchAutoPause = () => toast(
  '4시간 연속 실행되어 자동 일시정지했어요. 기록은 유지되며 다시 시작하거나 저장할 수 있어요.',
  { icon: toastIcons.autoPause, duration: 6000 }
);

// Pure completion-transition kernel shared by the live completion handler and
// the restore-time completion of a timer that expired while the tab was
// closed — the two paths must never disagree on cadence or cycle bookkeeping.
const computeNextTimerPhase = (
  completedMode: TimerMode,
  cycleCount: number,
  settings: Settings
): { nextMode: TimerMode; nextSeconds: number; nextCycle: number } => {
  if (completedMode === 'focus') {
    const nextCycle = cycleCount + 1;
    const nextMode: TimerMode =
      nextCycle % settings.longBreakInterval === 0 ? 'longBreak' : 'shortBreak';
    return {
      nextMode,
      nextSeconds: (nextMode === 'longBreak' ? settings.longBreak : settings.shortBreak) * 60,
      nextCycle,
    };
  }
  return {
    nextMode: 'focus',
    nextSeconds: settings.pomoTime * 60,
    nextCycle: completedMode === 'longBreak' ? 0 : cycleCount,
  };
};

// Deterministic UUID-shaped batch id for a restore-completed session, derived
// from the expired deadline: every context that completes the same snapshot
// (a second tab, a remount after a failed settle-write) produces the same id,
// so the server's batch idempotency dedupes them.
const expiredSessionBatchId = (targetTime: number) =>
  `00000000-0000-4000-8000-${targetTime.toString(16).padStart(12, '0').slice(-12)}`;

const FULL_STATE_KEY = 'fomopomo_full_state';

export default function TimerApp({
  settingsUpdated = 0,
  onRecordSaved,
  isLoggedIn,
  settingsOpen,
  onSettingsOpenChange,
  onStageChange,
  onOpenLogin,
}: TimerAppProps) {
  const [tab, setTab] = useState<'timer' | 'stopwatch'>('timer');
  const [isTaskSidebarOpen, setIsTaskSidebarOpen] = useState(false);
  // 방금 끝난 단계("집중 끝"/"휴식 끝" 안내 띠와 끝난 모습). 타이머는 이미 다음 단계로
  // 넘어가 있으므로, 화면에 보여 줄 끝난 단계의 모드·길이·사이클을 따로 둔다.
  // 다음 시작·모드 변경·초기화로 사라진다.
  const [ended, setEnded] = useState<EndedPhase | null>(null);
  const [internalSettingsOpen, setInternalSettingsOpen] = useState(false);
  const isSettingsOpen = settingsOpen ?? internalSettingsOpen;
  const setSettingsOpen = onSettingsOpenChange ?? setInternalSettingsOpen;
  const taskTriggerRef = useRef<HTMLButtonElement>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskHandoff, setTaskHandoffState] = useState<TaskHandoff | null>(null);
  const [isCompletingTask, setIsCompletingTask] = useState(false);
  const taskHandoffRef = useRef<TaskHandoff | null>(null);
  const completingTaskRef = useRef(false);
  const selectingTaskRef = useRef(false);
  const taskSelectionRequestRef = useRef(0);
  const closeTaskSidebar = () => {
    taskSelectionRequestRef.current += 1;
    selectingTaskRef.current = false;
    setIsTaskSidebarOpen(false);
  };
  const setTaskHandoff = useCallback((handoff: TaskHandoff | null) => {
    taskHandoffRef.current = handoff;
    setTaskHandoffState(handoff);
  }, []);

  // The record the task popup is waiting on. The record object carries its
  // own batch id, frozen segments and real end time, so answering the popup
  // late (or after other sessions ran) can neither inflate the record nor
  // attach it to another record's identity.
  const [pendingRecord, setPendingRecord] = useState<{
    record: PendingStudyRecord;
    onAfterSave?: () => void;
    labelsLocked?: boolean;
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
    longTermTasks,
    selectedTask,
    selectedTaskId,
    selectedSubjectId,
    setSelectedTask,
    setSelectedTaskId,
    setSelectedSubjectId,
    getSelectedTaskTitle,
    getSelectedTaskSubjectId,
    fetchDbTasks,
    createTask,
    toggleTaskStatus,
    completeTask,
    selectSubtaskForTimer,
    selectLongTermTaskForTimer,
    toggleSubtask,
    pendingSubtaskIds,
  } = useTasks(isLoggedIn);
  const { subjects } = useStudySubjects(isLoggedIn ? getCurrentUserId() : null);
  const getSubjectName = (subjectId: string | null | undefined) =>
    subjectId ? subjects.find(subject => subject.id === subjectId)?.name ?? null : null;

  // 선택기를 열 때마다 목록과 작업별 누적 시간을 새로 가져온다.
  const openTaskSidebar = useCallback(() => {
    setIsTaskSidebarOpen(true);
    void fetchDbTasks();
  }, [fetchDbTasks]);
  const toggleTaskSidebar = () => {
    if (isTaskSidebarOpen) closeTaskSidebar();
    else openTaskSidebar();
  };

  // 4. Study Session Hook
  const sessionIdentityRef = useRef<StudySessionIdentity | null>(null);
  const ensureSessionIdentity = useCallback(() => {
    if (!sessionIdentityRef.current) sessionIdentityRef.current = newStudySessionIdentity();
  }, []);
  const {
    isSaving,
    intervals,
    setIntervals,
    currentIntervalStartRef,
    updateStatus,
    createPendingRecord,
    savePendingRecord,
    checkActiveSession,
  } = useStudySession({
    isLoggedIn,
    onRecordSaved,
    selectedTaskTitle: getSelectedTaskTitle() || selectedTask,
    selectedSubjectId: getSelectedTaskSubjectId(),
    sessionIdentityRef,
  });

  // 4.5. Callback Ref for Timer Completion (Must be defined before useTimerLogic)
  // We need to use a Ref because handleTimerComplete depends on state that changes,
  // but we want the callback passed to useTimerLogic to be stable to prevent interval resets.
  const onTimerCompleteCallback = useRef<() => void>(() => { });

  // 5. Timer Logic Hook
  const {
    timerMode,
    timeLeft,
    timerDuration,
    isRunning,
    cycleCount,
    focusLoggedSeconds,
    setTimerMode,
    setTimeLeft,
    setTimerDuration,
    setIsRunning,
    setCycleCount,
    setFocusLoggedSeconds,
    startTimer,
    pauseTimer,
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
  const onStopwatchAutoPauseRef = useRef<(snapshot: StopwatchSnapshot) => void>(() => {});
  const {
    stopwatchTime,
    isStopwatchRunning,
    setIsStopwatchRunning,
    setStopwatchTime,
    toggleStopwatch,
    resetStopwatch,
    stopwatchStartTimeRef,
    stopwatchRunStartTimeRef,
  } = useStopwatchLogic({
    playClickSound,
    updateStatus: (status, task, startTime, elapsed, activityTime) => updateStatus(status, task, startTime, elapsed, 'stopwatch', 'focus', 0, activityTime),
    onAutoPauseRef: onStopwatchAutoPauseRef,
  });

  // 어느 시계든 다시 움직이거나 스톱워치로 넘어가면 종료 안내는 할 일을 다 했다.
  if (ended !== null && (isRunning || isStopwatchRunning || tab === 'stopwatch')) {
    setEnded(null);
  }

  // 시계가 멈춤 → 움직임으로 바뀐 횟수(시작·재개·다음 단계·반복 모두).
  const clockRunning = isRunning || isStopwatchRunning;
  const [startCount, setStartCount] = useState(0);
  const [wasClockRunning, setWasClockRunning] = useState(clockRunning);
  if (wasClockRunning !== clockRunning) {
    setWasClockRunning(clockRunning);
    if (clockRunning) setStartCount(count => count + 1);
  }

  // --- Account-scoped persistence namespace ---
  // Storage owner for every persisted key: the authenticated user id, or the
  // guest namespace when logged out. Ref to track if server sync has been done
  // (once per mount per account).
  const storageOwner = isLoggedIn ? getStorageOwner() : GUEST_OWNER;
  const hasSyncedRef = useRef(false);
  // Version session transitions so a delayed save can only reset the state
  // that created its record. Comparing displayed values would miss a
  // restart/pause or reset cycle that happens to return to the same values.
  const sessionRevisionRef = useRef(0);
  // Guards the task-persistence effect below: stays false until a real
  // (restored or user-made) task selection has been seen for this owner.
  const taskStateDirtyRef = useRef(false);

  // Auth changed (login/logout/account switch): reset all in-memory timer
  // state during this render — before any effect can persist the previous
  // account's state into the new namespace. The restore effect below then
  // rehydrates from the new owner's own keys.
  const [prevStorageOwner, setPrevStorageOwner] = useState(storageOwner);
  if (prevStorageOwner !== storageOwner) {
    setPrevStorageOwner(storageOwner);
    setTab('timer');
    setTimerMode('focus');
    setIsRunning(false);
    setTimeLeft(settings.pomoTime * 60);
    setTimerDuration(settings.pomoTime * 60);
    setCycleCount(0);
    setFocusLoggedSeconds(0);
    setIsStopwatchRunning(false);
    setStopwatchTime(0);
    setIntervals([]);
    setSelectedTask('');
    setSelectedTaskId(null);
    setSelectedSubjectId(null);
    // The task popup must not survive the owner switch: savePendingRecord
    // refuses records whose owner no longer matches, but the stale modal
    // would still be dead UI — close it. The record's parked draft stays in
    // the outbox until its owner signs back in.
    setTaskModalOpen(false);
    setPendingRecord(null);
    setTaskHandoffState(null);
    setIsCompletingTask(false);
    setIsTaskSidebarOpen(false);
    setEnded(null);
  }

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
    currentStart: number | null,
    duration: number
  ) => {
    sessionRevisionRef.current += 1;
    if (tRunning || sRunning) ensureSessionIdentity();
    // Stamp from the store, not the React `settings` closure: the preset
    // handler writes the store synchronously right before saving (the closure
    // still holds the pre-preset durations), and the expired-timer settle
    // path can run while the closure is still the hydration default. The
    // stamp must come from the same settings era as the timeLeft beside it,
    // or the restore re-sync misreads the snapshot.
    const configuredSettings = readSettingsSnapshot();
    const state = {
      sessionIdentity: sessionIdentityRef.current ? { ...sessionIdentityRef.current } : null,
      activeTab: currentTab,
      timer: {
        mode: tMode,
        duration,
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
        runStartTime: sRunning ? stopwatchRunStartTimeRef.current : null,
      },
      intervals: currentIntervals,
      currentIntervalStart: currentStart, // SAVE IT
      taskHandoff: tMode === 'focus' ? taskHandoffRef.current : null,
      configuredDurations: {
        focus: configuredSettings.pomoTime * 60,
        shortBreak: configuredSettings.shortBreak * 60,
        longBreak: configuredSettings.longBreak * 60,
      },
      lastUpdated: Date.now(),
    };
    writeOwnedJson(FULL_STATE_KEY, storageOwner, state);
  }, [storageOwner, stopwatchRunStartTimeRef, ensureSessionIdentity]);

  // --- Handlers ---

  // Saves a created record and, on a retryable failure, offers a toast retry
  // that re-saves the SAME record object — the batch id and segments travel in
  // the closure, so a retry can never attach to a different record.
  const attemptRecordSave = useCallback(async function attempt(record: PendingStudyRecord, taskText: string, taskId: string | null, onAfterSave?: () => void): Promise<SaveRecordResult> {
    const result = await savePendingRecord(record, taskText, taskId);
    if (result === 'saved' || result === 'rejected') {
      // Reset/close only when the save reached a terminal verdict: confirmed
      // ('saved') or permanently refused with the draft parked in the outbox
      // ('rejected'). A retryable failure keeps the draft for a retry.
      if (onAfterSave) onAfterSave();
    } else if (result === 'failed') {
      toast(
        (t) => (
          <div className="flex items-center gap-3">
            <span>저장에 실패했습니다. 기록은 보관 중입니다.</span>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                void attempt(record, taskText, taskId, onAfterSave);
              }}
              className="ui-button-primary ui-press min-h-9 shrink-0 rounded-chip px-3 text-sm"
            >
              재시도
            </button>
          </div>
        ),
        { duration: 12000, icon: toastIcons.warning }
      );
    }
    // 'skipped': another save is in flight or the account changed — the
    // parked draft keeps the record recoverable either way.
    return result;
  }, [savePendingRecord]);

  // Saving Logic Helper: creates the record (freezing its content and parking
  // it durably, both synchronous) and either saves it directly or hands it to
  // the task popup. onRecordCreated runs right after the record exists so the
  // caller can persist its own "content consumed" state in the same tick.
  const triggerSave = useCallback(async (recordMode: string, duration: number, onAfterSave?: () => void, forcedEndTime?: number, onRecordCreated?: () => void) => {
    // No in-flight guard here: a completion arriving while another save's RPC
    // is on the wire must still CREATE (and durably park) its record — the
    // attempt below then returns 'skipped' and mount recovery finishes the
    // parked draft. Double-clicks are already inert because onRecordCreated
    // consumes the content synchronously (the second click has nothing left
    // to save), and savePendingRecord's own synchronous lock serializes RPCs.
    if (duration < MIN_SAVABLE_SECONDS) {
      toast.error('10초 미만은 저장되지 않습니다.');
      return;
    }
    if (!isLoggedIn) {
      toast.error('로그인이 필요한 기능입니다.');
      return;
    }

    const record = selectedTaskId ? createPendingRecord(recordMode, duration, forcedEndTime, {
      task: getSelectedTaskTitle() || selectedTask,
      taskId: selectedTaskId,
      subjectId: getSelectedTaskSubjectId(),
    }) : createPendingRecord(recordMode, duration, forcedEndTime);
    if (!record) {
      toast.error('로그인이 필요한 기능입니다.');
      return;
    }
    if (onRecordCreated) onRecordCreated();

    if (settings.taskPopupEnabled && !selectedTaskId) {
      if (pendingRecord) {
        // A second completion arrived while the modal was still waiting for
        // an answer: finish the displaced record unlabeled under its own
        // batch id. Fire-and-forget — a failure leaves its parked draft for
        // recovery, and awaiting here would delay the modal swap.
        void attemptRecordSave(pendingRecord.record, '', null, pendingRecord.onAfterSave);
      }
      setPendingRecord({ record, onAfterSave });
      setTaskModalOpen(true);
    } else {
      await attemptRecordSave(record, getSelectedTaskTitle() || selectedTask, selectedTaskId, onAfterSave);
    }
  }, [isLoggedIn, settings.taskPopupEnabled, selectedTaskId, selectedTask, getSelectedTaskTitle, getSelectedTaskSubjectId, createPendingRecord, attemptRecordSave, pendingRecord]);

  const finishTaskHandoff = useCallback(async function finish(handoff: TaskHandoff) {
    if (completingTaskRef.current || taskHandoffRef.current !== handoff) return;
    completingTaskRef.current = true;
    setIsCompletingTask(true);
    const completed = await completeTask(handoff.task);
    // An account change, reset or new timer owns the UI by now.
    if (taskHandoffRef.current !== handoff || getStorageOwner() !== storageOwner) return;
    completingTaskRef.current = false;
    setIsCompletingTask(false);
    if (!completed) {
      toast((t) => (
        <div className="flex items-center gap-3">
          <span>시간은 보관했어요. 작업 완료 처리를 다시 시도해주세요.</span>
          <button className="shrink-0 font-bold" onClick={() => {
            toast.dismiss(t.id);
            void finish(handoff);
          }}>재시도</button>
        </div>
      ), { duration: 12000, icon: toastIcons.warning });
      return;
    }
    const ready = { ...handoff, completionPending: false };
    setTaskHandoff(ready);
    // Completion can settle after the drawer closed; only update its durable
    // phase, never reopen it or rewind the timer from an old closure.
    const saved = readOwnedJson<SavedAppState>(FULL_STATE_KEY, storageOwner);
    if (saved?.taskHandoff?.task.id === handoff.task.id) {
      writeOwnedJson(FULL_STATE_KEY, storageOwner, { ...saved, taskHandoff: ready, lastUpdated: Date.now() });
    }
    void fetchDbTasks();
  }, [completeTask, storageOwner, setTaskHandoff, fetchDbTasks]);

  const restoreTaskHandoff = useEffectEvent((handoff: TaskHandoff) => {
    setTaskHandoff(handoff);
    if (handoff.completionPending) void finishTaskHandoff(handoff);
  });

  const selectedTaskItem = [...dbTasks, ...weeklyPlans, ...monthlyPlans]
    .find(task => task.id === selectedTaskId);
  const timerOwnsFocusProgress = tab === 'timer' && timerMode === 'focus' &&
    !isStopwatchRunning && stopwatchTime === 0 && (isRunning || timeLeft < timerDuration || focusLoggedSeconds > 0);

  const handleCompleteTask = () => {
    if (taskHandoffRef.current) {
      setIsTaskSidebarOpen(true);
      if (taskHandoffRef.current.completionPending) void finishTaskHandoff(taskHandoffRef.current);
      return;
    }
    if (!isLoggedIn || !timerOwnsFocusProgress || !selectedTaskItem || selectedTaskItem.status === 'done') return;
    const now = Date.now();
    const remaining = isRunning ? Math.max(0, Math.ceil((endTimeRef.current - now) / 1000)) : timeLeft;
    if (remaining === 0) {
      pauseTimer(now);
      onTimerCompleteCallback.current();
      return;
    }
    const elapsed = timerDuration - remaining;
    const additional = Math.max(0, elapsed - focusLoggedSeconds);
    if ((additional > 0 && additional < MIN_SAVABLE_SECONDS) || remaining < MIN_SAVABLE_SECONDS) {
      toast.error('기록은 10초 이상부터 저장돼요. 현재 작업 시간과 남은 시간이 각각 10초 이상일 때 이어할 수 있어요.');
      return;
    }
    const record = additional > 0 ? createPendingRecord('pomo', additional, now, {
      task: selectedTaskItem.title,
      taskId: selectedTaskItem.id,
      subjectId: selectedTaskItem.subjectId ?? null,
    }) : null;
    if (additional > 0 && !record) {
      toast.error('기록을 보관할 수 없어 작업을 전환하지 않았어요. 다시 시도해주세요.');
      return;
    }
    pauseTimer(now);
    const handoff: TaskHandoff = { task: { ...selectedTaskItem }, completionPending: true };
    setTaskHandoff(handoff);
    setFocusLoggedSeconds(elapsed);
    setIntervals([]);
    currentIntervalStartRef.current = null;
    saveState('timer', 'focus', false, remaining, null, cycleCount, elapsed,
      false, 0, null, [], null, timerDuration);
    updateStatus('paused', selectedTaskItem.title, undefined, 0, 'timer', 'focus', remaining);
    setIsTaskSidebarOpen(true);
    if (record) void attemptRecordSave(record, selectedTaskItem.title, selectedTaskItem.id);
    void finishTaskHandoff(handoff);
  };

  const selectTimerTask = (task: TaskItem | null) => {
    const handoff = taskHandoffRef.current;
    // Ignore a second choice dispatched from the same render after the first
    // has already resumed the countdown.
    if (taskHandoff && !handoff) return;
    if (handoff?.completionPending || (handoff && (!task || task.status === 'done' || task.id === handoff.task.id))) return;
    taskSelectionRequestRef.current += 1;
    selectingTaskRef.current = false;
    setSelectedTask(task?.title ?? '');
    setSelectedTaskId(task?.id ?? null);
    setSelectedSubjectId(task?.subjectId ?? null);
    // Persist labels in the same interaction as resumption; a refresh before
    // the selection effect commits must still recover B, never completed A.
    taskStateDirtyRef.current = true;
    writeOwnedJson(TASK_STATE_KEY, storageOwner, {
      taskId: task?.id ?? null, taskTitle: task?.title ?? '', subjectId: task?.subjectId ?? null,
    });
    if (!handoff || !task) return;
    setTaskHandoff(null);
    setIsTaskSidebarOpen(false);
    currentIntervalStartRef.current = Date.now();
    startTimer({ mode: 'focus', remainingSeconds: timeLeft, durationSeconds: timerDuration, task: task.title });
    saveState('timer', 'focus', true, timeLeft, endTimeRef.current, cycleCount, focusLoggedSeconds,
      false, 0, null, [], currentIntervalStartRef.current, timerDuration);
  };

  const selectMaterializedTimerTask = async (materialize: () => Promise<TaskItem | null>) => {
    if (selectingTaskRef.current || taskHandoffRef.current?.completionPending) return null;
    selectingTaskRef.current = true;
    const request = ++taskSelectionRequestRef.current;
    const revision = sessionRevisionRef.current;
    try {
      const row = await materialize();
      if (!row || request !== taskSelectionRequestRef.current || revision !== sessionRevisionRef.current || getStorageOwner() !== storageOwner) return null;
      const handoff = taskHandoffRef.current;
      if (handoff && (handoff.completionPending || row.status === 'done' || row.id === handoff.task.id)) return null;
      selectTimerTask(row);
      return row;
    } finally {
      if (request === taskSelectionRequestRef.current) selectingTaskRef.current = false;
    }
  };

  const selectTimerSubtask = (subtask: LongTermSubtaskItem) =>
    selectMaterializedTimerTask(() => selectSubtaskForTimer(subtask, false));

  const selectTimerLongTermTask = (task: LongTermTaskItem) =>
    selectMaterializedTimerTask(() => selectLongTermTaskForTimer(task, false));

  // Auto-start must go through the same atomic start transition as a manual
  // start: a bare setIsRunning(true) would reuse the expired endTimeRef, so
  // the first interval tick would complete the timer again instantly and
  // paired auto-start settings would loop alarms/saves forever.
  // Invoked through a ref (same pattern as onTimerCompleteCallback) so the
  // delayed call reads post-completion state: fresh isRunning guard, updated
  // cycleCount/intervals for persistence.
  const autoStartTimer = useCallback((mode: TimerMode, seconds: number) => {
    // The user may have started something else during the delay; never
    // stomp an already-active session.
    if (isRunning || isStopwatchRunning || stopwatchTime > 0 || taskHandoffRef.current) return;

    ensureSessionIdentity();
    startTimer({ mode, remainingSeconds: seconds, durationSeconds: seconds });
    currentIntervalStartRef.current = Date.now();
    saveState(tab, mode, true, seconds, endTimeRef.current, cycleCount, focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null, intervals, currentIntervalStartRef.current, seconds);
  }, [isRunning, isStopwatchRunning, stopwatchTime, startTimer, saveState, tab, cycleCount, focusLoggedSeconds, intervals, currentIntervalStartRef, endTimeRef, ensureSessionIdentity]);

  const autoStartTimerRef = useRef(autoStartTimer);
  useEffect(() => {
    autoStartTimerRef.current = autoStartTimer;
  }, [autoStartTimer]);

  const handleTimerComplete = useCallback(() => {
    setTaskHandoff(null);
    // Play alarm (handled in useEffect/hook but let's make sure)
    playAlarm();
    // 다음 단계가 곧 자동으로 시작되면 안내 띠는 띄우지 않는다.
    const autoStartsNext = timerMode === 'focus' ? settings.autoStartBreaks : settings.autoStartPomos;
    if (!autoStartsNext) setEnded({ mode: timerMode, duration: timerDuration, cycleCount });

    const { nextMode, nextSeconds, nextCycle } = computeNextTimerPhase(timerMode, cycleCount, settings);

    if (timerMode === 'focus') {
      const remaining = timerDuration - focusLoggedSeconds;

      if (remaining > 0) {
        // Pass endTimeRef.current as forcedEndTime to ensure exact recording time
        const forcedEndTime = endTimeRef.current > 0 ? endTimeRef.current : undefined;
        triggerSave('pomo', remaining, undefined, forcedEndTime);
      }
      setFocusLoggedSeconds(0);
      setCycleCount(nextCycle);

      toast(nextMode === 'longBreak' ? '긴 휴식 시간입니다!' : '잠시 휴식하세요.', { icon: toastIcons.rest });
      if (settings.autoStartBreaks) setTimeout(() => {
        autoStartTimerRef.current(nextMode, nextSeconds);
      }, 1000);
    } else {
      // 긴 휴식 완료 후 focus로 돌아올 때 사이클 리셋
      if (nextCycle !== cycleCount) setCycleCount(nextCycle);
      setFocusLoggedSeconds(0);
      toast('다시 집중할 시간입니다!', { icon: toastIcons.focus });
      if (settings.autoStartPomos) setTimeout(() => {
        autoStartTimerRef.current('focus', nextSeconds);
      }, 1000);
    }

    // Apply and persist the post-completion transition from the same values,
    // so the on-screen state and the stored snapshot cannot diverge. Without
    // the persist, storage kept "running focus with an expired deadline plus
    // the old interval start" and a refresh during the break resurrected the
    // save button, re-saving the session inflated by the break time. (The
    // record itself is already durable: triggerSave parked it synchronously.)
    setTimerMode(nextMode);
    setTimeLeft(nextSeconds);
    setTimerDuration(nextSeconds);
    sessionIdentityRef.current = null;
    saveState(tab, nextMode, false, nextSeconds, null, nextCycle, 0, isStopwatchRunning, stopwatchTime, null, [], null, nextSeconds);

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

    // For logged-in users triggerSave's record creation already consumed the
    // interval state; this covers the guest path, where no record is created.
    setIntervals([]);
    currentIntervalStartRef.current = null;
  }, [timerMode, timerDuration, settings, focusLoggedSeconds, cycleCount, triggerSave, playAlarm, setFocusLoggedSeconds, setCycleCount, setTimerMode, setTimeLeft, setTimerDuration, setIntervals, endTimeRef, saveState, tab, isStopwatchRunning, stopwatchTime, currentIntervalStartRef, setTaskHandoff]);

  // Update the ref handler whenever `handleTimerComplete` changes
  useEffect(() => {
    onTimerCompleteCallback.current = handleTimerComplete;
  }, [handleTimerComplete]);


  // --- Wrappers for Toggle to handle persistence ---
  const handleToggleTimer = () => {
    if (taskHandoffRef.current) {
      handleCompleteTask();
      return;
    }
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
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      saveState(tab, timerMode, false, remaining, null, cycleCount, focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null, newIntervals, null, timerDuration);
    } else {
      // Starting
      const target = Date.now() + (timeLeft * 1000);
      currentIntervalStartRef.current = Date.now();
      saveState(tab, timerMode, true, timeLeft, target, cycleCount, focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null, intervals, currentIntervalStartRef.current, timerDuration);
    }
    toggleTimer();
  };

  const persistStopwatchPause = useCallback((snapshot: StopwatchSnapshot) => {
    const closed = closeStopwatchIntervals(intervals, currentIntervalStartRef.current, snapshot.endTime);
    setIntervals(closed);
    currentIntervalStartRef.current = null;
    saveState(tab, timerMode, isRunning, timeLeft, null, cycleCount, focusLoggedSeconds,
      false, snapshot.elapsed, null, closed, null, timerDuration);
    if (snapshot.autoPaused) notifyStopwatchAutoPause();
  }, [intervals, currentIntervalStartRef, setIntervals, saveState, tab, timerMode, isRunning,
    timeLeft, cycleCount, focusLoggedSeconds, timerDuration]);

  useLayoutEffect(() => {
    onStopwatchAutoPauseRef.current = persistStopwatchPause;
  }, [persistStopwatchPause]);

  const handleToggleStopwatch = () => {
    const hasTimerProgress = !isRunning && timeLeft < timerDuration && timeLeft > 0;

    if (taskHandoffRef.current || isRunning || (timerMode === 'focus' && focusLoggedSeconds > 0) || hasTimerProgress) {
      toast.error('타이머 기록이 있습니다.\n먼저 타이머를 초기화하거나 저장해주세요.');
      return;
    }

    ensureSessionIdentity();
    const snapshot = toggleStopwatch();
    if (!snapshot) return;
    if (!snapshot.isRunning) {
      persistStopwatchPause(snapshot);
    } else {
      currentIntervalStartRef.current = snapshot.endTime;
      saveState(tab, timerMode, isRunning, timeLeft, null, cycleCount, focusLoggedSeconds,
        true, snapshot.elapsed, stopwatchStartTimeRef.current, intervals, snapshot.endTime, timerDuration);
    }
  };

  const handleChangeTimerMode = (mode: TimerMode) => {
    if (isStopwatchRunning || stopwatchTime > 0) {
      toast.error('스톱워치 기록이 있습니다.\n먼저 스톱워치를 초기화하거나 저장해주세요.');
      return;
    }
    setEnded(null);
    // 모드를 바꾸면 늘 타이머 보기로 간다(스톱워치 보기에서 고른 경우 포함). 저장도 그 탭으로 한다.
    setTab('timer');
    setTaskHandoff(null);
    completingTaskRef.current = false;
    setIsCompletingTask(false);
    if (timerMode === 'focus' && isLoggedIn) {
      const elapsed = timerDuration - timeLeft;
      const additional = elapsed - focusLoggedSeconds;
      // Save unsaved focus time before the switch discards it — but only
      // with actual session evidence: `elapsed` derived from settings alone
      // can be phantom time (pomoTime raised while the timer sat idle).
      // Sub-savable remainders and guests skip silently — a mode switch must
      // never surface an error toast.
      const hasSessionEvidence = intervals.length > 0 || currentIntervalStartRef.current !== null;
      if (additional >= MIN_SAVABLE_SECONDS && hasSessionEvidence) {
        triggerSave('pomo', additional, undefined, Date.now());
      }
    }

    // Persist the duration applied by the hook, not this render's old timeLeft.
    const nextTimeLeft = changeTimerMode(mode);
    sessionIdentityRef.current = null;
    setIntervals([]);
    currentIntervalStartRef.current = null;
    saveState('timer', mode, false, nextTimeLeft, null, cycleCount, mode === 'focus' ? 0 : focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null, [], null, nextTimeLeft);
  };

  // 적용했으면 true(빠른 설정 창을 닫는다).
  const handlePresetClick = (minutes: number) => {
    if (isStopwatchRunning || stopwatchTime > 0) {
      toast.error('스톱워치 기록이 있습니다.\n먼저 스톱워치를 초기화하거나 저장해주세요.');
      return false;
    }
    if (isRunning) {
      toast.error("타이머가 작동 중입니다.\n먼저 정지해주세요.");
      return false;
    }
    setEnded(null);
    // 프리셋은 스톱워치 보기에서도 고를 수 있다. 타이머 보기로 옮기고 그 탭으로 저장한다.
    setTab('timer');
    setTaskHandoff(null);
    completingTaskRef.current = false;
    setIsCompletingTask(false);
    setTimerMode("focus");
    setTimeLeft(minutes * 60);
    setTimerDuration(minutes * 60);
    setFocusLoggedSeconds(0);
    sessionIdentityRef.current = null;
    setSettings((prev: Settings) => ({ ...prev, pomoTime: minutes }));
    setIntervals([]);
    saveState('timer', "focus", false, minutes * 60, null, cycleCount, 0, isStopwatchRunning, stopwatchTime, null, [], null, minutes * 60);
    toast.success(`${minutes === 0.1 ? '5초' : minutes + '분'}으로 설정됨`);
    return true;
  };

  // 모드 탭: 스톱워치 탭은 보기만 바꾸고(타이머는 그대로), 타이머 모드는 기존 모드 변경
  // 규칙(스톱워치 기록 확인, 집중 중간 기록 저장, 초기화)을 그대로 따른다.
  // 이미 고른 탭을 다시 눌러도 아무 일도 하지 않는다(초기화는 재설정 버튼으로).
  const handleSelectMode = (key: TimerModeKey) => {
    if (key === 'stopwatch') {
      setTab('stopwatch');
      return;
    }
    if (tab === 'stopwatch') setTab('timer');
    if (key !== timerMode) handleChangeTimerMode(key);
    // 끝난 단계를 보여 주는 중에 이미 준비된 다음 단계 탭을 고르면 그 단계를 쉬는 상태로 보여 준다.
    else setEnded(null);
  };

  // 종료 안내 띠: 주 동작은 이미 준비된 다음 단계(휴식/집중)를 시작하고,
  // 보조 동작은 방금 끝난 단계를 한 번 더 시작한다(계속 집중 / 조금 더 쉬기).
  const handleEndedPrimary = () => {
    setEnded(null);
    handleToggleTimer();
  };

  const handleEndedSecondary = () => {
    const repeatMode = ended?.mode;
    if (!repeatMode) return;
    setEnded(null);
    const minutes = repeatMode === 'focus' ? settings.pomoTime
      : repeatMode === 'shortBreak' ? settings.shortBreak : settings.longBreak;
    playClickSound();
    autoStartTimer(repeatMode, minutes * 60);
  };

  // 빠른 설정 저장: 현재 저장된 설정에 시간·사이클만 덮어쓴다. 쉬고 있는 타이머는
  // useTimerLogic이 새 길이로 맞추고, 진행 중인 세션은 그대로 둔다.
  const handleSaveTimerSettings = async (values: TimerDurationSettings) => {
    const didPersist = await persistSettings({ ...readSettingsSnapshot(), ...values });
    if (!didPersist) {
      toast.error('설정을 저장할 수 없습니다. 데이터를 복구하거나 초기화한 뒤 다시 시도해주세요.');
      return false;
    }
    toast.success('설정이 저장되었습니다!');
    return true;
  };

  const handleSaveTimer = () => {
    if (taskHandoffRef.current) return;
    const configuredFullTime = timerMode === 'focus' ? settings.pomoTime * 60 : timerMode === 'shortBreak' ? settings.shortBreak * 60 : settings.longBreak * 60;
    const elapsed = timerDuration - timeLeft;
    const additional = elapsed - focusLoggedSeconds;

    if (additional > 0) {
      let savedRevision: number | null = null;
      const afterSave = () => {
        // This callback also runs after retries, terminal rejections and task
        // popup answers. The record can finish saving without owning the
        // timer anymore; leave newer progress and its persisted state alone.
        if (
          savedRevision !== sessionRevisionRef.current ||
          getStorageOwner() !== storageOwner
        ) return;
        const currentSettings = readSettingsSnapshot();
        const currentFullTime = (timerMode === 'focus'
          ? currentSettings.pomoTime
          : timerMode === 'shortBreak'
            ? currentSettings.shortBreak
            : currentSettings.longBreak) * 60;
        // Settings can change without a session snapshot being written.
        if (currentFullTime !== configuredFullTime) return;

        const resetTime = resetTimerManual();
        sessionIdentityRef.current = null;
        setIntervals([]);
        saveState(tab, timerMode, false, resetTime, null, cycleCount, 0, isStopwatchRunning, stopwatchTime, null, [], null, resetTime);
        updateStatus('online', undefined, undefined, 0, 'timer', timerMode, 0);
      };
      triggerSave('pomo', additional, afterSave, Date.now(), () => {
        // The record now owns these minutes: advance loggedSeconds (hiding
        // the save button) and persist the consumed snapshot, so a refresh
        // cannot re-offer time whose durable copy is the parked draft.
        const newLogged = focusLoggedSeconds + additional;
        setFocusLoggedSeconds(newLogged);
        saveState(tab, timerMode, false, timeLeft, null, cycleCount, newLogged, isStopwatchRunning, stopwatchTime, null, [], null, timerDuration);
        savedRevision = sessionRevisionRef.current;
      });
    }
  };

  const handleSaveStopwatch = async () => {
    await triggerSave('stopwatch', stopwatchTime, undefined, Date.now(), () => {
      // Stop only once the record actually exists: flipping the flag before
      // triggerSave's guards would desync memory from the persisted snapshot
      // on an early return.
      resetStopwatch();
      sessionIdentityRef.current = null;
      // The record froze the full session content (including the still-open
      // interval, closed at the click time above) — consume the stopwatch
      // eagerly and persist the consumed snapshot, so neither a re-click nor
      // a refresh can save the same time again.
      saveState(tab, timerMode, isRunning, timeLeft, null, cycleCount, focusLoggedSeconds, false, 0, null, [], null, timerDuration);
      updateStatus('online', undefined, undefined, 0);
    });
  };

  const handleResetStopwatch = () => {
    resetStopwatch();
    sessionIdentityRef.current = null;
    setIntervals([]);
    currentIntervalStartRef.current = null;
    saveState(tab, timerMode, isRunning, timeLeft, null, cycleCount, focusLoggedSeconds, false, 0, null, [], null, timerDuration);
    // Clear server state
    updateStatus('online', undefined, undefined, 0);
  };

  // 'failed' keeps the modal open for an in-place retry. 'skipped' with no
  // save in flight means clicking again can never succeed (the auth session
  // is gone or changed; savePendingRecord already toasted) — close the modal
  // instead of trapping the user under a full-screen overlay with no dismiss
  // control. The record's parked outbox draft keeps it recoverable.
  const closeIfUnrecoverable = (result: SaveRecordResult) => {
    if (result === 'skipped' && !isSaving) {
      setTaskModalOpen(false);
      setPendingRecord(null);
    }
  };

  const handleDisableTaskPopup = async () => {
    const previousSettings = { ...settings };
    const updated = { ...previousSettings, taskPopupEnabled: false };
    setSettings(updated);
    const didPersist = await persistSettings(updated);
    if (!didPersist) {
      setSettings(previousSettings);
      toast.error('설정을 저장할 수 없습니다. 데이터를 복구하거나 초기화한 뒤 다시 시도해주세요.');
      return;
    }
    // Announce only the setting change here; the save outcome gets its own
    // toast from savePendingRecord, so a premature success message can't
    // contradict a failed save.
    toast.success('자동 팝업을 껐어요. 설정에서 다시 켤 수 있어요.');
    if (pendingRecord) {
      setPendingRecord(current => current?.record === pendingRecord.record ? { ...current, labelsLocked: true } : current);
      const result = await savePendingRecord(pendingRecord.record, selectedTask, selectedTaskId, selectedSubjectId);
      // Keep the modal and pending record only on retryable failure; 'rejected'
      // is terminal (the draft is parked in the outbox) so clean up as well.
      if (result !== 'saved' && result !== 'rejected') {
        closeIfUnrecoverable(result);
        return;
      }
      if (pendingRecord.onAfterSave) pendingRecord.onAfterSave();
      setPendingRecord(null);
      setSelectedTask('');
      setSelectedTaskId(null);
      setSelectedSubjectId(null);
    }
    setTaskModalOpen(false);
  };

  const handleTaskSubmit = async () => {
    if (!pendingRecord) return;
    setPendingRecord(current => current?.record === pendingRecord.record ? { ...current, labelsLocked: true } : current);
    const result = await savePendingRecord(pendingRecord.record, selectedTask, selectedTaskId, selectedSubjectId);
    // Keep the modal and pending record only on retryable failure; 'rejected'
    // is terminal (the draft is parked in the outbox) so clean up as well.
    if (result !== 'saved' && result !== 'rejected') {
      closeIfUnrecoverable(result);
      return;
    }
    if (pendingRecord.onAfterSave) pendingRecord.onAfterSave();
    setTaskModalOpen(false);
    setPendingRecord(null);
    setSelectedTask('');
    setSelectedTaskId(null);
    setSelectedSubjectId(null);
  };

  const handleTaskSkip = async () => {
    if (!pendingRecord) return;
    setPendingRecord(current => current?.record === pendingRecord.record ? { ...current, labelsLocked: true } : current);
    setSelectedTask('');
    setSelectedTaskId(null);
    setSelectedSubjectId(null);
    // Skipping means "record this session without a task": pass an explicit
    // null taskId so a db-task chip clicked (then abandoned) inside the modal
    // cannot attribute the session to that task.
    const result = await savePendingRecord(pendingRecord.record, '', null, null);
    // Keep the modal and pending record only on retryable failure; 'rejected'
    // is terminal (the draft is parked in the outbox) so clean up as well.
    if (result !== 'saved' && result !== 'rejected') {
      closeIfUnrecoverable(result);
      return;
    }
    if (pendingRecord.onAfterSave) pendingRecord.onAfterSave();
    setTaskModalOpen(false);
    setPendingRecord(null);
    setSelectedTask('');
    setSelectedTaskId(null);
    setSelectedSubjectId(null);
  };


  // Reset every hydration/sync ref (including hasSyncedRef) whenever the
  // storage owner changes. Effects run in declaration order, so this is
  // guaranteed to run before the restore and server-sync effects below and
  // they can never reuse the previous account's refs.
  useEffect(() => {
    hasSyncedRef.current = false;
    sessionIdentityRef.current = null;
    endTimeRef.current = 0;
    stopwatchStartTimeRef.current = 0;
    stopwatchRunStartTimeRef.current = null;
    currentIntervalStartRef.current = null;
    taskStateDirtyRef.current = false;
    taskHandoffRef.current = null;
    completingTaskRef.current = false;
    selectingTaskRef.current = false;
    return () => {
      // Invalidate callbacks on unmount and account changes, including an
      // eventual return to the original account before a save resolves.
      sessionRevisionRef.current += 1;
    };
  }, [storageOwner, endTimeRef, stopwatchStartTimeRef, stopwatchRunStartTimeRef, currentIntervalStartRef]);

  // Completion transition for a timer whose deadline passed while the tab was
  // closed: the closed tab never ran handleTimerComplete, so the restore must
  // save the focus session (clamped at the real deadline — the away time is
  // NOT study time) and settle the mode transition. useEffectEvent so the
  // mount-time restore effect can read live settings/handlers without them
  // becoming re-run triggers.
  const completeExpiredTimer = useEffectEvent((state: SavedAppState, targetTime: number) => {
    // Cross-account race guard: this snapshot belongs to storageOwner. If the
    // live auth identity moved on between render and this effect, leave the
    // snapshot untouched for its owner's next mount instead of attributing
    // the session to the wrong account.
    if (storageOwner !== GUEST_OWNER && getCurrentUserId() !== storageOwner) return;

    // The React settings snapshot can still be the hydration default when
    // this runs in the mount effect; read the persisted settings directly so
    // the transition and the record use the user's real configuration.
    const currentSettings = readSettingsSnapshot();

    let savedDirectly = false;

    if (state.timer.mode === 'focus') {
      // Only time that actually passed before the deadline counts — clamp
      // every piece of evidence at targetTime.
      const savedIntervals = (state.intervals ?? [])
        .filter(isValidInterval)
        .filter((interval) => interval.start < targetTime)
        .map((interval) => ({ start: interval.start, end: Math.min(interval.end, targetTime) }));
      const currentStart =
        state.currentIntervalStart && state.currentIntervalStart < targetTime
          ? state.currentIntervalStart
          : null;
      // The record can never exceed the snapshot's actual interval evidence:
      // a settings change while away (or clock skew) must not let the
      // synthesized fallback fabricate study time.
      const evidenceSeconds = Math.round(
        (savedIntervals.reduce((sum, interval) => sum + (interval.end - interval.start), 0) +
          (currentStart ? targetTime - currentStart : 0)) / 1000
      );
      const remaining = Math.min(
        (state.timer.duration ?? state.configuredDurations?.focus ?? currentSettings.pomoTime * 60) - (state.timer.loggedSeconds || 0),
        evidenceSeconds
      );

      if (remaining >= MIN_SAVABLE_SECONDS && isLoggedIn) {
        // Capture the persisted classification before async task hydration or
        // an auto-started phase can change the current selection.
        const savedTask = readOwnedJson<SavedTaskState>(TASK_STATE_KEY, storageOwner);
        const record = createPendingRecord('pomo', remaining, targetTime, {
          intervals: savedIntervals,
          currentStart,
          sessionId: expiredSessionBatchId(targetTime),
          ...(state.sessionIdentity ? {
            sourceSessionId: state.sessionIdentity.id,
            progressStart: state.sessionIdentity.progressStart,
          } : {}),
          subjectId: savedTask?.subjectId ?? null,
          ...(savedTask?.taskId ? { task: savedTask.taskTitle || '', taskId: savedTask.taskId } : {}),
        });
        if (!record) {
          // isLoggedIn is stale-true but no auth owner is resolvable: leave
          // the snapshot claimable instead of consuming its content with no
          // durable copy anywhere.
          return;
        }
        // The task selection is restored asynchronously elsewhere; read the
        // persisted selection directly so the record keeps its label.
        if (currentSettings.taskPopupEnabled && !savedTask?.taskId) {
          // Same labeling policy as a live completion: the user labels the
          // finished session in the popup. The record is already parked, so
          // abandoning the popup cannot lose it.
          setPendingRecord({ record });
          setTaskModalOpen(true);
        } else {
          void attemptRecordSave(record, savedTask?.taskTitle || '', savedTask?.taskId || null);
          savedDirectly = true;
        }
      }
    }

    const { nextMode, nextSeconds, nextCycle } = computeNextTimerPhase(
      state.timer.mode,
      state.timer.cycleCount,
      currentSettings
    );
    // 방금(30분 안) 끝난 단계만 종료 안내 띠로 이어 준다. 오래된 것은 토스트로 충분하다.
    if (Date.now() - targetTime < 30 * 60 * 1000) {
      const finishedMode = state.timer.mode;
      const configuredMinutes = finishedMode === 'focus' ? currentSettings.pomoTime
        : finishedMode === 'shortBreak' ? currentSettings.shortBreak : currentSettings.longBreak;
      setEnded({
        mode: finishedMode,
        duration: state.timer.duration ?? state.configuredDurations?.[finishedMode] ?? configuredMinutes * 60,
        cycleCount: state.timer.cycleCount,
      });
    }
    setCycleCount(nextCycle);
    setTimerMode(nextMode);
    setTimeLeft(nextSeconds);
    setTimerDuration(nextSeconds);
    setFocusLoggedSeconds(0);
    setIsRunning(false);
    sessionIdentityRef.current = null;
    // Persist the settled transition. The stopwatch slice is carried over
    // faithfully so storage cannot disagree with the hydration this restore
    // performs from the same snapshot.
    const stopwatchRunning = Boolean(state.stopwatch?.isRunning && state.stopwatch?.startTime);
    saveState(
      state.activeTab, nextMode, false, nextSeconds, null, nextCycle, 0,
      stopwatchRunning, state.stopwatch?.elapsed ?? 0, state.stopwatch?.startTime ?? null,
      [], null, nextSeconds
    );

    if (state.timer.mode === 'focus') {
      toast(
        savedDirectly
          ? '자리 비운 사이 뽀모도로가 완료되어 기록을 저장했어요. 휴식할 시간!'
          : '자리 비운 사이 뽀모도로가 완료되었어요.',
        { icon: toastIcons.completed }
      );
    } else {
      toast('휴식이 끝났어요. 다시 집중할 시간입니다!', { icon: toastIcons.focus });
    }

    // The session is settled: skip this mount's server-state sync so stale
    // paused/studying profile data cannot resurrect what was just recorded,
    // and clear the server-side session state (the closed tab's offline
    // beacon is best-effort and may never have landed).
    hasSyncedRef.current = true;
    void updateStatus('online', undefined, undefined, 0, 'timer', nextMode, 0);
  });

  const pauseRecoveredStopwatch = useEffectEvent((snapshot: StopwatchSnapshot) => {
    updateStatus('paused', undefined, undefined, snapshot.elapsed, 'stopwatch', 'focus', 0, snapshot.endTime);
    notifyStopwatchAutoPause();
  });

  const restoreStopwatchSnapshot = useEffectEvent((state: SavedAppState, now: number): SavedAppState => {
    const stopwatch = state.stopwatch;
    if (!stopwatch.isRunning || !stopwatch.startTime || stopwatch.startTime <= 1704067200000) return state;
    // Old snapshots stored the accumulated baseline at start. Imported
    // sessions now retain a separate origin because their open ledger starts
    // at import time, which must never extend the four-hour deadline.
    const runStartTime = stopwatch.runStartTime
      ?? state.currentIntervalStart
      ?? stopwatch.startTime + Math.max(0, stopwatch.elapsed) * 1000;
    let recoveredIntervals = (state.intervals ?? []).filter(isValidInterval);
    if (recoveredIntervals.length === 0 && runStartTime > stopwatch.startTime) {
      recoveredIntervals = [{ start: stopwatch.startTime, end: runStartTime }];
    }
    // Legacy snapshots can lack the open ledger pointer. Closed imported
    // time may already cover part of this run, so reopen after that evidence.
    const currentStart = state.currentIntervalStart ?? recoveredIntervals.reduce(
      (latest, interval) => Math.max(latest, interval.end), runStartTime
    );
    const snapshot = getStopwatchSnapshot(stopwatch.startTime, runStartTime, now);
    if (!snapshot.autoPaused) {
      return { ...state, stopwatch: { ...stopwatch, runStartTime },
        intervals: recoveredIntervals, currentIntervalStart: currentStart };
    }

    const settled: SavedAppState = {
      ...state,
      stopwatch: { isRunning: false, elapsed: snapshot.elapsed, startTime: null, runStartTime: null },
      intervals: closeStopwatchIntervals(recoveredIntervals, currentStart, snapshot.endTime),
      currentIntervalStart: null,
      lastUpdated: now,
    };
    // Settle even snapshots older than a day and persist before notifying,
    // so a reload cannot reopen or re-notify the same unattended run.
    writeOwnedJson(FULL_STATE_KEY, storageOwner, settled);
    sessionRevisionRef.current += 1;
    hasSyncedRef.current = true;
    pauseRecoveredStopwatch(snapshot);
    return settled;
  });

  // --- Restore ---
  useEffect(() => {
    const restoreState = () => {
      if (storageOwner !== GUEST_OWNER) {
        // Explicit migration for authenticated accounts: legacy global-key
        // state of unknown or foreign ownership is discarded, never
        // inherited, so a newly authenticated account starts from defaults
        // (or its own saved state) instead of silently adopting guest state.
        clearForeignLegacyState(FULL_STATE_KEY);
        clearForeignLegacyState(TASK_STATE_KEY);
      }

      const savedState = readOwnedJson<SavedAppState>(FULL_STATE_KEY, storageOwner);
      if (savedState) {
        try {
          sessionIdentityRef.current = isStudySessionIdentity(savedState.sessionIdentity)
            ? { ...savedState.sessionIdentity } : null;
          if (!sessionIdentityRef.current) {
            ensureSessionIdentity();
            savedState.sessionIdentity = sessionIdentityRef.current;
            writeOwnedJson(FULL_STATE_KEY, storageOwner, savedState);
          }
          const now = Date.now();
          const state = restoreStopwatchSnapshot(savedState, now);
          // A deadline that passed while the tab was closed means the timer
          // completed without its completion handler ever running.
          const expiredTargetTime =
            state.timer?.isRunning && state.timer.targetTime && state.timer.targetTime <= now
              ? state.timer.targetTime
              : null;

          if (now - state.lastUpdated < 24 * 60 * 60 * 1000 || state.stopwatch.elapsed > 0 || state.taskHandoff) {
            setTab(state.activeTab);
            if (state.taskHandoff && state.timer.mode === 'focus' && !state.timer.isRunning && state.timer.timeLeft > 0) {
              restoreTaskHandoff(state.taskHandoff);
              setSelectedTask(state.taskHandoff.task.title);
              setSelectedTaskId(state.taskHandoff.task.id);
              setSelectedSubjectId(state.taskHandoff.task.subjectId ?? null);
              hasSyncedRef.current = true;
            }

            // For an expired timer, completeExpiredTimer (below) both applies
            // and persists the settled transition, and the snapshot's
            // intervals belong to the record it creates — so the timer slice
            // and interval hydration are skipped entirely in that case.
            if (!expiredTargetTime) {
              setTimerMode(state.timer.mode);
              setCycleCount(state.timer.cycleCount);
              setFocusLoggedSeconds(state.timer.loggedSeconds || 0);
              const restoredSettings = readSettingsSnapshot();
              const configuredFull =
                state.timer.mode === 'focus'
                  ? restoredSettings.pomoTime * 60
                  : state.timer.mode === 'shortBreak'
                    ? restoredSettings.shortBreak * 60
                    : restoredSettings.longBreak * 60;
              setTimerDuration(
                state.timer.duration ?? state.configuredDurations?.[state.timer.mode] ?? configuredFull
              );

              if (state.timer.isRunning && state.timer.targetTime) {
                setTimeLeft(Math.ceil((state.timer.targetTime - now) / 1000));
                setIsRunning(true);
                endTimeRef.current = state.timer.targetTime;
                currentIntervalStartRef.current = Date.now();
              } else {
                // An idle snapshot still sitting at the full duration that
                // was configured when it was written adopts the CURRENTLY
                // configured duration instead: settings may have changed
                // since (another tab, another device, or a save right before
                // this reload), and resurrecting the stale full time would
                // both display the old duration and open a phantom-save
                // window (fullTime - timeLeft counting minutes never
                // studied). Anything else — partial progress, banked
                // seconds, unstamped legacy snapshots — restores verbatim.
                const stampedFull = state.configuredDurations?.[state.timer.mode];
                const idleAtStampedFull =
                  stampedFull !== undefined &&
                  state.timer.timeLeft === stampedFull &&
                  (state.timer.duration === undefined || state.timer.duration === stampedFull) &&
                  !(state.timer.loggedSeconds > 0);
                // A non-positive (or non-numeric) idle timeLeft is never
                // real progress — it is a finished-but-unsettled or corrupt
                // snapshot (e.g. an old client that persisted pomoTime 0
                // from a cleared input, whose settings now clamp to a
                // positive duration). Restoring it verbatim would show 00:00
                // and offer a save button for fullTime seconds never studied.
                const brokenIdle = !(state.timer.timeLeft > 0);
                if (idleAtStampedFull || brokenIdle) {
                  setTimerDuration(configuredFull);
                }
                if (brokenIdle) {
                  // The banked seconds' durable copy is the saved record or
                  // parked draft; keeping them against a fresh full timer
                  // would violate elapsed >= logged and silently under-record
                  // the next session.
                  setFocusLoggedSeconds(0);
                }
                setTimeLeft(
                  idleAtStampedFull || brokenIdle
                    ? configuredFull
                    : state.timer.timeLeft
                );
                setIsRunning(false);
              }
            }

            if (state.stopwatch.isRunning && state.stopwatch.startTime) {
              if (state.stopwatch.startTime > 1704067200000) {
                const elapsed = Math.floor((now - state.stopwatch.startTime) / 1000);
                setStopwatchTime(elapsed);
                setIsStopwatchRunning(true);
                stopwatchStartTimeRef.current = state.stopwatch.startTime;
                stopwatchRunStartTimeRef.current = state.stopwatch.runStartTime ?? null;
                currentIntervalStartRef.current = Date.now();
              } else {
                setStopwatchTime(0);
                setIsStopwatchRunning(false);
              }
            } else {
              setStopwatchTime(state.stopwatch.elapsed);
              setIsStopwatchRunning(false);
            }

            if (!expiredTargetTime) {
              if (state.intervals) {
                setIntervals(state.intervals.filter(isValidInterval));
              }

              // Restore current interval start if available
              if (state.currentIntervalStart) {
                currentIntervalStartRef.current = state.currentIntervalStart;
              } else if ((state.timer.isRunning || state.stopwatch.isRunning) && !currentIntervalStartRef.current) {
                // Fallback for migration or if missing but running
                currentIntervalStartRef.current = Date.now();
              }
            } else {
              completeExpiredTimer(state, expiredTargetTime);
            }
          } else if (expiredTargetTime) {
            // The snapshot is too old to rehydrate UI state, but the session
            // it holds is still real and its segments end at the deadline —
            // complete and save it instead of silently discarding it.
            completeExpiredTimer(state, expiredTargetTime);
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
  }, [setTimerMode, setCycleCount, setFocusLoggedSeconds, setTimeLeft, setTimerDuration, setIsRunning, endTimeRef, setIsStopwatchRunning, setStopwatchTime, stopwatchStartTimeRef, stopwatchRunStartTimeRef, setIntervals, setSelectedTaskId, setSelectedTask, setSelectedSubjectId, setTaskHandoff, isLoggedIn, currentIntervalStartRef, storageOwner, ensureSessionIdentity]);

  useEffect(() => {
    if (!isLoggedIn) return;

    // 이미 동기화 완료된 경우 스킵 (계정별로 마운트 시 1회만 실행)
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;

    // Dropped when the storage owner changes mid-flight so a late server
    // response can never hydrate another account's session.
    let cancelled = false;

    const syncServerState = async () => {
      try {
        const saved = readOwnedJson<SavedAppState>(FULL_STATE_KEY, storageOwner);
        const local = saved && (Date.now() - saved.lastUpdated < 24 * 60 * 60 * 1000 || saved.stopwatch.elapsed > 0)
          ? saved
          : null;
        if (local?.timer.isRunning || local?.stopwatch.isRunning) return;

        const revision = sessionRevisionRef.current;
        const data = await checkActiveSession();
        if (
          cancelled ||
          revision !== sessionRevisionRef.current ||
          getStorageOwner() !== storageOwner ||
          !data
        ) return;

        const now = Date.now();
        // Older clients cannot prove which logical clock their presence row
        // describes. Importing it under a fresh UUID would defeat deduplication.
        // The source device keeps its local time and can resume to publish ID.
        if (!isStudySessionIdentity({ id: data.study_session_id, progressStart: data.study_session_offset })) {
          if (data.study_start_time || data.total_stopwatch_time > 0) {
            toast('다른 기기의 기록을 이어하려면 해당 기기를 새로고침한 뒤 한 번 재개해주세요.', { icon: toastIcons.refresh });
          }
          return;
        }
        const remoteUpdated = data.last_active_at ? new Date(data.last_active_at).getTime() : NaN;
        // A local save/reset is stronger evidence than an older profile. In
        // particular, loggedSeconds may already belong to a saved/outbox
        // record and must not be turned back into unsaved study time.
        if (local && (!Number.isFinite(remoteUpdated) || remoteUpdated <= local.lastUpdated)) return;

        if (data.timer_type === 'timer') {
          if (local && local.stopwatch.elapsed > 0) return;
          const mode = normalizeTimerMode(data.timer_mode);
          const currentSettings = readSettingsSnapshot();
          const configuredDuration = (mode === 'focus'
            ? currentSettings.pomoTime
            : mode === 'shortBreak' ? currentSettings.shortBreak : currentSettings.longBreak) * 60;
          const duration = data.timer_duration || configuredDuration;
          if (!Number.isFinite(duration) || duration <= 0 || duration >= 24 * 60 * 60) return;

          // Presence can be offline after the source tab closes, and breaks
          // use online. A pause clears study_start_time; presence alone does
          // not tell us whether the clock is still running.
          const startTime = data.study_start_time ? new Date(data.study_start_time).getTime() : NaN;
          const running = Number.isFinite(startTime);
          const elapsed = running
            ? Math.floor((now - startTime) / 1000)
            : data.total_stopwatch_time || 0;
          if (!Number.isFinite(elapsed) || elapsed < 0 || (!running && elapsed === 0)) return;
          const remaining = duration - elapsed;
          if (remaining <= 0) return;

          const localDuration = local?.timer.duration
            ?? (local ? local.configuredDurations?.[local.timer.mode] : undefined)
            ?? configuredDuration;
          const samePhase = local?.timer.mode === mode && localDuration === duration
            && (!local.sessionIdentity || local.sessionIdentity.id === data.study_session_id);
          const localElapsed = local ? Math.max(0, localDuration - local.timer.timeLeft) : 0;
          const localLogged = local?.timer.loggedSeconds || 0;
          // Without a shared server session id we cannot merge unrelated
          // phases safely. Keep unfinished local work instead of discarding
          // it, and only carry consumed seconds into the same phase.
          if (samePhase && localElapsed > elapsed) return;
          if (!samePhase && localElapsed > localLogged) return;
          const logged = mode === 'focus' && samePhase
            ? Math.min(localLogged, elapsed)
            : 0;
          const unsaved = elapsed - logged;
          const endedAt = running || !Number.isFinite(remoteUpdated)
            ? now
            : Math.min(now, remoteUpdated);
          // Profiles carry elapsed totals, not the source device's pause
          // intervals. Preserve that known total as a closed interval, then
          // track subsequent work separately so local pause gaps stay out.
          const importedIntervals = mode === 'focus' && unsaved > 0
            ? [{ start: endedAt - unsaved * 1000, end: endedAt }]
            : [];
          const currentStart = running ? now : null;
          const targetTime = running ? now + remaining * 1000 : null;
          const cycle = local?.timer.cycleCount || 0;

          sessionIdentityRef.current = { id: data.study_session_id, progressStart: data.study_session_offset + logged };

          setTab('timer');
          setTimerMode(mode);
          setTimerDuration(duration);
          setTimeLeft(remaining);
          setIsRunning(running);
          setCycleCount(cycle);
          setFocusLoggedSeconds(logged);
          setIntervals(importedIntervals);
          currentIntervalStartRef.current = currentStart;
          endTimeRef.current = targetTime ?? 0;
          setIsStopwatchRunning(false);
          setStopwatchTime(0);
          saveState('timer', mode, running, remaining, targetTime, cycle, logged,
            false, 0, null, importedIntervals, currentStart, duration);
          if (running) toast.success('다른 기기에서 진행 중인 타이머를 불러왔습니다.');
          return;
        }

        const currentSettings = readSettingsSnapshot();
        const focusDuration = currentSettings.pomoTime * 60;
        const localDuration = local?.timer.duration
          ?? (local ? local.configuredDurations?.[local.timer.mode] : undefined)
          ?? (local?.timer.mode === 'shortBreak' ? currentSettings.shortBreak * 60
            : local?.timer.mode === 'longBreak' ? currentSettings.longBreak * 60 : focusDuration);
        // An unrelated remote stopwatch cannot consume unfinished local focus
        // or break progress. The two clocks share one interval ledger.
        if (local && localDuration - local.timer.timeLeft > (local.timer.loggedSeconds || 0)) return;

        const startTime = data.study_start_time ? new Date(data.study_start_time).getTime() : NaN;
        const remoteRunning = Number.isFinite(startTime);
        const baseline = data.total_stopwatch_time || 0;
        if (!Number.isFinite(baseline) || baseline < 0) return;
        const runStartTime = remoteRunning ? startTime + baseline * 1000 : null;
        const snapshot = runStartTime !== null ? getStopwatchSnapshot(startTime, runStartTime, now) : null;
        const running = remoteRunning && !snapshot?.autoPaused;
        const elapsed = snapshot?.elapsed ?? baseline;
        if (!Number.isFinite(elapsed) || elapsed < 0 || (!remoteRunning && elapsed === 0) || elapsed < (local?.stopwatch.elapsed || 0)) return;
        const endedAt = snapshot?.endTime ?? (!Number.isFinite(remoteUpdated) ? now : Math.min(now, remoteUpdated));
        // Preserve the source device's known total before opening a new local
        // interval. Otherwise the next save only records work since import.
        const importedIntervals = elapsed > 0 ? [{ start: endedAt - elapsed * 1000, end: endedAt }] : [];
        const currentStart = running ? now : null;
        const cycle = local?.timer.cycleCount || 0;

        sessionIdentityRef.current = { id: data.study_session_id, progressStart: data.study_session_offset };

        setTab('stopwatch');
        setTimerMode('focus');
        setTimerDuration(focusDuration);
        setTimeLeft(focusDuration);
        setIsRunning(false);
        setCycleCount(cycle);
        setFocusLoggedSeconds(0);
        endTimeRef.current = 0;
        setStopwatchTime(elapsed);
        setIsStopwatchRunning(running);
        stopwatchStartTimeRef.current = running ? startTime : 0;
        stopwatchRunStartTimeRef.current = running ? runStartTime : null;
        setIntervals(importedIntervals);
        currentIntervalStartRef.current = currentStart;
        saveState('stopwatch', 'focus', false, focusDuration, null, cycle, 0,
          running, elapsed, running ? startTime : null, importedIntervals, currentStart, focusDuration);
        if (snapshot?.autoPaused) {
          pauseRecoveredStopwatch(snapshot);
        } else if (running) toast.success('다른 기기에서 진행 중인 스톱워치를 불러왔습니다.');
      } catch (e) {
        console.error('Sync failed', e);
      }
    };

    syncServerState();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, checkActiveSession, setTab, setStopwatchTime, setIsStopwatchRunning, stopwatchStartTimeRef, stopwatchRunStartTimeRef, currentIntervalStartRef, setIntervals, endTimeRef, setFocusLoggedSeconds, setIsRunning, setTimeLeft, setTimerDuration, setCycleCount, setTimerMode, storageOwner, saveState]);




  // Persist Task. The mount-time flush runs with the initial empty selection
  // while useTasks' restore only reads the key after its async fetch — an
  // unconditional write here would clobber the stored selection before it is
  // ever read, so hold off until a real (restored or user-made) selection has
  // been seen for this storage owner.
  useEffect(() => {
    if (!taskStateDirtyRef.current) {
      if (selectedTaskId === null && selectedTask === '' && selectedSubjectId === null) return;
      taskStateDirtyRef.current = true;
    }
    writeOwnedJson(TASK_STATE_KEY, storageOwner, {
      taskId: selectedTaskId,
      taskTitle: selectedTask,
      subjectId: getSelectedTaskSubjectId(),
    });
  }, [selectedTaskId, selectedTask, selectedSubjectId, getSelectedTaskSubjectId, storageOwner]);

  // Space = 시작/일시정지. 포커스가 버튼·링크·탭·입력 같은 컨트롤에 있으면 그 컨트롤의
  // 기본 동작(누르기)에 맡기고, 대화상자·팝오버가 열려 있을 때도 끼어들지 않는다.
  const handleSpaceToggle = useEffectEvent((event: KeyboardEvent) => {
    if (event.code !== 'Space' && event.key !== ' ') return;
    if (event.defaultPrevented || !isSpaceShortcutTarget(event.target)) return;
    if (taskModalOpen || isSettingsOpen || isTaskSidebarOpen) return;
    if (document.querySelector(OPEN_LAYER_SELECTOR)) return;
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

  // 무대 색과 시트 접힘은 페이지가 그린다. 보이는 탭의 시계가 돌 때만 모드 색을 입힌다.
  const stageTone: BeadTone | null = tab === 'stopwatch'
    ? (isStopwatchRunning ? 'watch' : null)
    : (isRunning ? (timerMode === 'focus' ? 'pomo' : 'rest') : null);
  const stageBusy = clockRunning || ended !== null;
  useEffect(() => {
    onStageChange?.({ tone: stageTone, busy: stageBusy, startCount });
  }, [onStageChange, stageTone, stageBusy, startCount]);

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


  // 끝난 단계를 보여 주는 동안은 그 단계의 탭을 고른 것으로 보인다(보드와 같게).
  const selectedModeKey: TimerModeKey = tab === 'stopwatch' ? 'stopwatch' : ended?.mode ?? timerMode;
  const selectedTaskTitle = taskHandoff?.task.title || getSelectedTaskTitle() || selectedTask;
  const selectedTaskSubject = getSubjectName(taskHandoff ? taskHandoff.task.subjectId : selectedSubjectId);
  const resetTimer = () => {
    setEnded(null);
    setTaskHandoff(null);
    completingTaskRef.current = false;
    setIsCompletingTask(false);
    const resetTime = resetTimerManual();
    sessionIdentityRef.current = null;
    setIntervals([]);
    currentIntervalStartRef.current = null;
    saveState(tab, timerMode, false, resetTime, null, cycleCount, timerMode === 'focus' ? 0 : focusLoggedSeconds, isStopwatchRunning, stopwatchTime, null, [], null, resetTime);
    updateStatus('online', undefined, undefined, 0, 'timer', timerMode, 0);
  };

  return (
    <div className="flex flex-1 flex-col">
      <TaskModal
        isOpen={taskModalOpen}
        dbTasks={dbTasks}
        selectedTask={selectedTask}
        selectedTaskId={selectedTaskId}
        selectedSubjectId={selectedSubjectId}
        isSaving={isSaving}
        labelsLocked={pendingRecord?.labelsLocked ?? false}
        userId={isLoggedIn ? getCurrentUserId() : null}
        onSelectSubject={setSelectedSubjectId}
        onSelectTask={(task, id) => {
          setSelectedTask(task);
          setSelectedTaskId(id);
          if (id) setSelectedSubjectId(dbTasks.find(item => item.id === id)?.subjectId ?? null);
        }}
        onSave={handleTaskSubmit}
        onSkip={handleTaskSkip}
        onDisablePopup={handleDisableTaskPopup}
      />

      <TimerSettingsDialog
        key={storageOwner}
        open={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveTimerSettings}
        onPresetClick={handlePresetClick}
      />

      <TaskSidebar
        userId={isLoggedIn ? getCurrentUserId() : null} onCreateTask={createTask}
        isOpen={isTaskSidebarOpen} onClose={closeTaskSidebar}
        tasks={dbTasks} weeklyPlans={weeklyPlans} monthlyPlans={monthlyPlans} longTermTasks={longTermTasks}
        pendingToggleSubtaskIds={pendingSubtaskIds} selectedTaskId={selectedTaskId}
        choosingNextTask={Boolean(taskHandoff)} selectionDisabled={Boolean(taskHandoff?.completionPending)}
        excludedTaskId={taskHandoff?.task.id ?? null}
        subjects={subjects} anchorRef={taskTriggerRef} onOpenLogin={onOpenLogin}
        onSelectTask={selectTimerTask}
        onToggleTask={(task) => {
          if (task.id === selectedTaskId && task.status !== 'done' && timerOwnsFocusProgress) handleCompleteTask();
          else void toggleTaskStatus(task);
        }}
        onSelectSubtask={selectTimerSubtask}
        onSelectLongTermTask={selectTimerLongTermTask}
        onToggleSubtask={(subtask) => {
          if (selectedTaskItem?.sourceSubtaskId === subtask.id && !subtask.completed_at && timerOwnsFocusProgress) handleCompleteTask();
          else void toggleSubtask(subtask);
        }}
      />

      <TimerModeTabs
        value={selectedModeKey}
        onSelect={handleSelectMode}
        panelId={TIMER_PANEL_ID}
      />

      <section
        id={TIMER_PANEL_ID}
        role="tabpanel"
        aria-labelledby={getTimerTabId(selectedModeKey)}
        className={cn(
          'flex flex-1 flex-col items-center justify-center px-5 pt-3 pb-8 md:min-h-[600px] md:px-8 md:pt-6 md:pb-14',
          // 색이 든 무대에서는 빈 구슬을 흰색으로 둔다.
          stageTone && '[--bead-off:var(--color-white)]',
        )}
      >
        {tab === 'timer' ? (
          <TimerDisplay
            timerMode={timerMode} timeLeft={timeLeft} timerDuration={timerDuration} isRunning={isRunning} isSaving={isSaving}
            cycleCount={cycleCount} longBreakInterval={settings.longBreakInterval}
            ended={ended} onEndedPrimary={handleEndedPrimary} onEndedSecondary={handleEndedSecondary}
            showSaveButton={timerMode === 'focus' && !isRunning && timerDuration - timeLeft - focusLoggedSeconds > 0}
            // 끝난 모습에서는 초기화로 안내를 닫고 준비된 다음 단계로 돌아간다(보드의 재설정).
            showResetButton={ended !== null || (!isRunning && timeLeft !== timerDuration)}
            onToggleTimer={handleToggleTimer}
            onCompleteTask={handleCompleteTask}
            canCompleteTask={isLoggedIn && timerOwnsFocusProgress && Boolean(selectedTaskItem && selectedTaskItem.status !== 'done')}
            isCompletingTask={isCompletingTask}
            isChoosingNextTask={Boolean(taskHandoff)}
            onResetTimer={resetTimer}
            onSaveTimer={handleSaveTimer}
            onOpenSettings={() => setSettingsOpen(true)}
            selectedTaskId={selectedTaskId} selectedTaskTitle={selectedTaskTitle} selectedTaskSubject={selectedTaskSubject}
            isTaskPickerOpen={isTaskSidebarOpen} onToggleTaskPicker={toggleTaskSidebar} taskTriggerRef={taskTriggerRef}
          />
        ) : (
          <StopwatchDisplay
            stopwatchTime={stopwatchTime} isStopwatchRunning={isStopwatchRunning} isSaving={isSaving}
            onToggleStopwatch={handleToggleStopwatch} onSaveStopwatch={handleSaveStopwatch} onResetStopwatch={handleResetStopwatch}
            onOpenSettings={() => setSettingsOpen(true)}
            selectedTaskId={selectedTaskId} selectedTaskTitle={getSelectedTaskTitle() || selectedTask} selectedTaskSubject={getSubjectName(selectedSubjectId)}
            isTaskPickerOpen={isTaskSidebarOpen} onToggleTaskPicker={toggleTaskSidebar} taskTriggerRef={taskTriggerRef}
          />
        )}
      </section>
    </div>
  );
}
