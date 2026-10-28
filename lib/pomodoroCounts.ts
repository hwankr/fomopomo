import { getStudyDayRange } from './dateUtils';

/*
 * ── 뽀모도로 세기 규칙(모든 화면 공통) ──
 *
 * 1. 끝낸 뽀모도로 1개 = 집중 세션 저장 배치 1개. mode가 'pomo'(예전 행은 'focus')인
 *    study_sessions 행을 session_batch_id ?? group_id ?? id로 묶고 배치마다 한 번만 센다.
 *    (공부일 경계에서 잘린 조각 행도 같은 배치라 한 번만 센다.)
 * 2. 배치는 가장 이른 행의 created_at이 속한 05:00 공부일(getStudyDayRange)에 귀속된다.
 * 3. 스톱워치는 뽀모도로로 세지 않는다(집중 시간 합계에는 들어간다).
 * 4. 작업의 끝낸 수 = 그 task_id를 가진 배치 수, 목표 = tasks.estimated_pomodoros(null·0은 1).
 * 5. 하루의 계획한(남은) 구슬 = 그날 끝내지 않은 작업마다 max(0, 목표 - 끝낸 수)의 합.
 *
 * 화면 코드와 분리된 순수 함수만 둔다(React·Supabase 의존 없음).
 */

/** 뽀모도로 세기에 필요한 study_sessions 열 */
export type PomodoroSessionRow = {
  id: string | number;
  created_at: string;
  mode: string | null;
  task_id?: string | null;
  session_batch_id?: string | null;
  group_id?: string | null;
};

/** 목표 계산에 필요한 tasks 열 */
export type PomodoroTaskRow = {
  id: string;
  status: string | null;
  estimated_pomodoros: number | null;
};

export type PomodoroBatch = {
  key: string;
  /** 배치에서 가장 이른 행의 created_at */
  firstCreatedAt: Date;
  /** 'yyyy-MM-dd' — firstCreatedAt이 속한 05:00 공부일 */
  studyDayKey: string;
  /** 배치 행들이 가리키는 작업(보통 하나) */
  taskIds: string[];
};

export type TaskPomodoroProgress = { done: number; goal: number };

export const POMODORO_GOAL_MIN = 1;
export const POMODORO_GOAL_MAX = 8;

/** 뽀모도로로 세는 모드인가('pomo', 예전 행의 'focus'). 휴식·스톱워치는 아니다. */
export function isPomodoroMode(mode: string | null | undefined): boolean {
  return mode === 'pomo' || mode === 'focus';
}

/** 저장 배치 키: session_batch_id ?? group_id ?? id */
export function getSessionBatchKey(row: Pick<PomodoroSessionRow, 'id' | 'session_batch_id' | 'group_id'>): string {
  return row.session_batch_id ?? row.group_id ?? String(row.id);
}

const pad = (value: number) => String(value).padStart(2, '0');

/** 시각이 속한 05:00 공부일의 날짜 키('yyyy-MM-dd', 기기 로컬). */
export function getStudyDayKey(date: Date): string {
  const start = getStudyDayRange(date).start;
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

/** 뽀모도로 행을 저장 배치로 묶는다. 휴식·스톱워치 행과 날짜를 읽을 수 없는 행은 뺀다. */
export function groupPomodoroBatches(rows: readonly PomodoroSessionRow[]): PomodoroBatch[] {
  const batches = new Map<string, { firstCreatedAt: Date; taskIds: Set<string> }>();
  for (const row of rows) {
    if (!isPomodoroMode(row.mode)) continue;
    const createdAt = new Date(row.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;
    const key = getSessionBatchKey(row);
    const batch = batches.get(key);
    if (!batch) {
      batches.set(key, { firstCreatedAt: createdAt, taskIds: new Set(row.task_id ? [row.task_id] : []) });
      continue;
    }
    if (createdAt < batch.firstCreatedAt) batch.firstCreatedAt = createdAt;
    if (row.task_id) batch.taskIds.add(row.task_id);
  }
  return [...batches].map(([key, batch]) => ({
    key,
    firstCreatedAt: batch.firstCreatedAt,
    studyDayKey: getStudyDayKey(batch.firstCreatedAt),
    taskIds: [...batch.taskIds],
  }));
}

/** 끝낸 뽀모도로 수(배치 수). */
export function countPomodoros(rows: readonly PomodoroSessionRow[]): number {
  return groupPomodoroBatches(rows).length;
}

/** 공부일('yyyy-MM-dd')마다 끝낸 뽀모도로 수. */
export function countPomodorosByStudyDay(rows: readonly PomodoroSessionRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const batch of groupPomodoroBatches(rows)) {
    counts.set(batch.studyDayKey, (counts.get(batch.studyDayKey) ?? 0) + 1);
  }
  return counts;
}

/** 작업(task_id)마다 끝낸 뽀모도로 수. 한 배치는 작업마다 한 번만 센다. */
export function countPomodorosByTask(rows: readonly PomodoroSessionRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const batch of groupPomodoroBatches(rows)) {
    for (const taskId of batch.taskIds) counts.set(taskId, (counts.get(taskId) ?? 0) + 1);
  }
  return counts;
}

/** 작업의 뽀모도로 목표. 비었거나 0 이하이면 1(DB 기본값과 같다). */
export function getTaskPomodoroGoal(estimated: number | null | undefined): number {
  if (typeof estimated !== 'number' || !Number.isFinite(estimated) || estimated < 1) return 1;
  return Math.floor(estimated);
}

/** 목표 입력(스테퍼) 값을 1–8로 맞춘다. */
export function clampPomodoroGoal(value: number): number {
  if (!Number.isFinite(value)) return POMODORO_GOAL_MIN;
  return Math.min(POMODORO_GOAL_MAX, Math.max(POMODORO_GOAL_MIN, Math.round(value)));
}

/** 작업 하나의 { 끝낸 수, 목표 } */
export function getTaskPomodoroProgress(
  task: Pick<PomodoroTaskRow, 'id' | 'estimated_pomodoros'>,
  doneByTask: ReadonlyMap<string, number>,
): TaskPomodoroProgress {
  return { done: doneByTask.get(task.id) ?? 0, goal: getTaskPomodoroGoal(task.estimated_pomodoros) };
}

/** 끝내지 않은 작업들의 남은 뽀모도로 합(계획한 구슬 수). */
export function countPlannedRemaining(
  tasks: readonly PomodoroTaskRow[],
  doneByTask: ReadonlyMap<string, number>,
): number {
  return tasks.reduce((sum, task) => {
    if (task.status === 'done') return sum;
    const { done, goal } = getTaskPomodoroProgress(task, doneByTask);
    return sum + Math.max(0, goal - done);
  }, 0);
}
