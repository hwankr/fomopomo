import { describe, expect, it } from 'vitest';
import {
  clampPomodoroGoal,
  countPlannedRemaining,
  countPomodoros,
  countPomodorosByStudyDay,
  countPomodorosByTask,
  getSessionBatchKey,
  getStudyDayKey,
  getTaskPomodoroGoal,
  getTaskPomodoroProgress,
  groupPomodoroBatches,
  isPomodoroMode,
  type PomodoroSessionRow,
} from '../pomodoroCounts';

// 로컬 시각으로 만들어 실행 머신의 타임존과 무관하게 05:00 경계를 검증한다.
const at = (d: number, h: number, min = 0) => new Date(2026, 9, d, h, min).toISOString();

let nextId = 0;
const row = (fields: Partial<PomodoroSessionRow> & Pick<PomodoroSessionRow, 'created_at'>): PomodoroSessionRow => ({
  id: ++nextId, mode: 'pomo', task_id: null, session_batch_id: null, group_id: null, ...fields,
});

describe('isPomodoroMode', () => {
  it('pomo와 예전 focus만 뽀모도로로 센다', () => {
    expect(isPomodoroMode('pomo')).toBe(true);
    expect(isPomodoroMode('focus')).toBe(true);
    for (const mode of ['stopwatch', 'shortBreak', 'longBreak', null, undefined]) {
      expect(isPomodoroMode(mode)).toBe(false);
    }
  });
});

describe('getSessionBatchKey', () => {
  it('session_batch_id, group_id, id 순서로 배치 키를 고른다', () => {
    expect(getSessionBatchKey({ id: 1, session_batch_id: 'batch', group_id: 'legacy' })).toBe('batch');
    expect(getSessionBatchKey({ id: 1, session_batch_id: null, group_id: 'legacy' })).toBe('legacy');
    expect(getSessionBatchKey({ id: 7, session_batch_id: null, group_id: null })).toBe('7');
  });
});

describe('groupPomodoroBatches / countPomodoros', () => {
  it('같은 배치의 행은 한 번만 세고 스톱워치·휴식은 빼낸다', () => {
    const rows = [
      row({ created_at: at(27, 9, 25), session_batch_id: 'a' }),
      row({ created_at: at(27, 9, 26), session_batch_id: 'a' }),
      row({ created_at: at(27, 10), group_id: 'legacy-b' }),
      row({ created_at: at(27, 11) }),
      row({ created_at: at(27, 12), mode: 'stopwatch' }),
      row({ created_at: at(27, 12, 30), mode: 'shortBreak' }),
      row({ created_at: 'not a date' }),
    ];
    expect(countPomodoros(rows)).toBe(3);
    expect(groupPomodoroBatches(rows).map(batch => batch.key)).toEqual(['a', 'legacy-b', String(nextId - 3)]);
  });

  it('05:00 경계에서 잘린 배치는 가장 이른 행의 공부일에 한 번만 귀속된다', () => {
    // 4:50–5:10에 걸친 한 세션: 4:59:59 조각(전날 공부일)과 5:10 조각(당일)
    const rows = [
      row({ created_at: at(28, 5, 10), session_batch_id: 'split' }),
      row({ created_at: new Date(2026, 9, 28, 4, 59, 59, 999).toISOString(), session_batch_id: 'split' }),
    ];
    const [batch] = groupPomodoroBatches(rows);
    expect(batch.studyDayKey).toBe('2026-10-27');
    expect(countPomodorosByStudyDay(rows)).toEqual(new Map([['2026-10-27', 1]]));
  });
});

describe('getStudyDayKey', () => {
  it('05:00 전 시각은 전날 공부일이다', () => {
    expect(getStudyDayKey(new Date(2026, 9, 28, 4, 59))).toBe('2026-10-27');
    expect(getStudyDayKey(new Date(2026, 9, 28, 5, 0))).toBe('2026-10-28');
    expect(getStudyDayKey(new Date(2026, 0, 1, 3))).toBe('2025-12-31');
  });
});

describe('countPomodorosByStudyDay', () => {
  it('공부일마다 배치 수를 센다', () => {
    const rows = [
      row({ created_at: at(26, 9) }),
      row({ created_at: at(26, 23) }),
      row({ created_at: at(27, 2) }), // 26일 공부일
      row({ created_at: at(27, 9) }),
      row({ created_at: at(27, 10), mode: 'stopwatch' }),
    ];
    expect(countPomodorosByStudyDay(rows)).toEqual(new Map([['2026-10-26', 3], ['2026-10-27', 1]]));
  });
});

describe('countPomodorosByTask', () => {
  it('작업마다 그 task_id를 가진 배치 수를 센다', () => {
    const rows = [
      row({ created_at: at(27, 9), task_id: 'algo', session_batch_id: 'a' }),
      row({ created_at: at(27, 9, 1), task_id: 'algo', session_batch_id: 'a' }),
      row({ created_at: at(27, 10), task_id: 'algo' }),
      row({ created_at: at(27, 11), task_id: 'stat' }),
      row({ created_at: at(27, 12), task_id: 'stat', mode: 'stopwatch' }),
      row({ created_at: at(27, 13) }),
    ];
    expect(countPomodorosByTask(rows)).toEqual(new Map([['algo', 2], ['stat', 1]]));
  });
});

describe('goals', () => {
  it('비었거나 0 이하인 목표는 1로 본다', () => {
    expect(getTaskPomodoroGoal(null)).toBe(1);
    expect(getTaskPomodoroGoal(undefined)).toBe(1);
    expect(getTaskPomodoroGoal(0)).toBe(1);
    expect(getTaskPomodoroGoal(-2)).toBe(1);
    expect(getTaskPomodoroGoal(4)).toBe(4);
  });

  it('스테퍼 값은 1–8로 맞춘다', () => {
    expect(clampPomodoroGoal(0)).toBe(1);
    expect(clampPomodoroGoal(3)).toBe(3);
    expect(clampPomodoroGoal(12)).toBe(8);
    expect(clampPomodoroGoal(Number.NaN)).toBe(1);
  });

  it('작업의 끝낸 수와 목표를 함께 준다', () => {
    const done = new Map([['algo', 2]]);
    expect(getTaskPomodoroProgress({ id: 'algo', estimated_pomodoros: 4 }, done)).toEqual({ done: 2, goal: 4 });
    expect(getTaskPomodoroProgress({ id: 'new', estimated_pomodoros: null }, done)).toEqual({ done: 0, goal: 1 });
  });

  it('남은 계획은 끝내지 않은 작업의 max(0, 목표 - 끝낸 수) 합이다', () => {
    const done = new Map([['algo', 2], ['over', 5], ['stat', 1]]);
    const tasks = [
      { id: 'algo', status: 'todo', estimated_pomodoros: 4 }, // 2 남음
      { id: 'over', status: 'in_progress', estimated_pomodoros: 3 }, // 목표 초과 → 0
      { id: 'stat', status: 'done', estimated_pomodoros: 3 }, // 끝낸 작업은 빼낸다
      { id: 'blank', status: 'todo', estimated_pomodoros: null }, // 목표 1
    ];
    expect(countPlannedRemaining(tasks, done)).toBe(3);
  });
});
