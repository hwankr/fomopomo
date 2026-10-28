import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartData } from '@/hooks/useStudyStats';

const motion = vi.hoisted(() => ({ playMotion: vi.fn() }));

vi.mock('@/components/ui/motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/motion')>()),
  playMotion: motion.playMotion,
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/hooks/useAuthSession', () => ({ useAuthSession: () => ({ session: { user: { id: 'user-a' } } }) }));
vi.mock('@/hooks/useStudySubjects', () => ({ useStudySubjects: () => ({ subjects: [{ id: 'blockchain', user_id: 'user-a', name: '블록체인' }], error: null }) }));
vi.mock('@/components/subjects/SubjectHistoryManager', () => ({ default: () => <p>과목 정리 화면</p> }));

import StudyReport, { type StudyStats } from '@/components/StudyReport';
import { summarizeStudySessions } from '@/hooks/useStudyStats';

const fetchStats = vi.fn();

function stats(overrides: Partial<StudyStats> = {}): StudyStats {
  return {
    loading: false, error: null, totalFocusTime: 0, todayFocusTime: 0, earliestYear: 2026, heatmapData: [], chartData: [], fetchStats,
    periodTotals: summarizeStudySessions([
      { task: '블록체인 복습', subject_id: 'blockchain', duration: 1800, created_at: '' },
      { task: '블록체인 과제', subject_id: 'blockchain', duration: 600, created_at: '' },
    ]),
    lifetimeTotals: summarizeStudySessions([]),
    ...overrides,
  };
}

const bucket = (bucketKey: string, seconds: number, taskTotals: Record<string, number> = {}): ChartData =>
  ({ name: bucketKey, hours: seconds / 3600, seconds, taskTotals, bucketKey, displayLabel: bucketKey, breakdownLabel: '' });

const week = (seconds: number) => [bucket('2026-10-26', seconds, { 복습: seconds }), bucket('2026-10-27', 0), bucket('2026-10-28', 600, { 과제: 600 })];

// 기간 내용(막대 상자·작업별 시간·합계 목록)과 막대에 재생한 움직임
const contentCalls = () => motion.playMotion.mock.calls.filter(([element, keyframes]) => element && 'opacity' in keyframes[0] && 'transform' in keyframes[0]);
const barCalls = () => motion.playMotion.mock.calls.filter(([, keyframes]) => keyframes[0].transform === 'scaleY(0)');
const fadeCalls = () => motion.playMotion.mock.calls.filter(([, keyframes]) => 'opacity' in keyframes[0] && !('transform' in keyframes[0]));

describe('공부 기록 리포트 움직임', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 28, 12));
    motion.playMotion.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('처음 불러올 때와 같은 기간을 다시 조회할 때는 움직이지 않고, 기간을 넘기면 새 내용이 넘긴 쪽에서 나타난다', () => {
    const view = render(<StudyReport stats={stats({ loading: true })} />);
    view.rerender(<StudyReport stats={stats({ chartData: week(3600) })} />);
    // 과목 정리 뒤처럼 같은 기간을 다시 조회했다.
    view.rerender(<StudyReport stats={stats({ loading: true, chartData: week(3600) })} />);
    view.rerender(<StudyReport stats={stats({ chartData: week(4200) })} />);
    expect(motion.playMotion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '이전 주' }));
    // 집계가 오기 전에는 그대로다.
    view.rerender(<StudyReport stats={stats({ loading: true, chartData: week(4200) })} />);
    expect(motion.playMotion).not.toHaveBeenCalled();
    view.rerender(<StudyReport stats={stats({ chartData: week(1800) })} />);

    const chart = screen.getByRole('button', { name: /10월 26일 월요일/ }).parentElement;
    const breakdown = screen.getByRole('heading', { name: /작업별 집중 시간/ }).parentElement;
    const totals = screen.getByText(/^합계 /).parentElement;
    expect(contentCalls().map(([element]) => element)).toEqual([chart, breakdown, totals]);
    expect(contentCalls().every(([, keyframes]) => keyframes[0].transform === 'translateX(-6px)' && keyframes[0].opacity === 0)).toBe(true);
    expect(barCalls()).toHaveLength(3);
    expect(barCalls().every(([element, , options]) => chart?.contains(element) && options?.duration === 'emphasized')).toBe(true);

    motion.playMotion.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '다음 주' }));
    view.rerender(<StudyReport stats={stats({ chartData: week(2400) })} />);
    expect(contentCalls().map(([, keyframes]) => keyframes[0].transform)).toEqual(['translateX(6px)', 'translateX(6px)', 'translateX(6px)']);

    // 단위를 바꾸면 방향 없이 나타나고, 전체 누적은 기간과 상관이 없어 움직이지 않는다.
    fireEvent.click(screen.getByRole('button', { name: '전체 누적' }));
    motion.playMotion.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '월간' }));
    view.rerender(<StudyReport stats={stats({ chartData: [bucket('2026-10-01', 600)] })} />);
    expect(contentCalls().map(([element, keyframes]) => [element === totals, keyframes[0].transform])).toEqual([[false, 'translateX(0px)'], [false, 'translateX(0px)']]);
  });

  it('다른 막대를 고르면 작업별 시간만 살짝 나타난다', () => {
    render(<StudyReport stats={stats({ chartData: week(3600) })} />);
    const breakdown = screen.getByRole('heading', { name: '10월 28일 작업별 집중 시간' }).parentElement;

    fireEvent.click(screen.getByRole('button', { name: /10월 28일 수요일/ }));
    expect(motion.playMotion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /10월 26일 월요일/ }));
    expect(screen.getByRole('heading', { name: '10월 26일 작업별 집중 시간' })).toBeInTheDocument();
    expect(fadeCalls().map(([element]) => element)).toEqual([breakdown]);
  });

  it('합계 범위와 묶는 기준을 바꾸면 새 목록이 나타난다', () => {
    render(<StudyReport stats={stats({ chartData: week(3600) })} />);
    expect(motion.playMotion).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '할 일별' }));
    const list = screen.getByText(/^합계 /).parentElement;
    expect(fadeCalls().map(([element]) => element)).toEqual([list]);
  });
});

describe('과목 줄 펼치기', () => {
  const running: Array<() => void> = [];

  beforeEach(() => {
    // happy-dom은 전환을 돌리지 않으므로 접히는 중인 ui-collapse에서 전환이 도는 것처럼 꾸민다.
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value(this: Element) {
        if (!this.classList.contains('ui-collapse') || this.getAttribute('data-state') !== 'closed') return [];
        let finish!: () => void;
        const finished = new Promise<void>((resolve) => { finish = resolve; });
        running.push(finish);
        return [{
          playState: 'running', currentTime: 0, finished,
          effect: { getTiming: () => ({ iterations: 1, duration: 140, delay: 0 }), getComputedTiming: () => ({ endTime: 140 }) },
        }];
      },
    });
  });
  afterEach(() => {
    cleanup();
    delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
  });

  it('펼치면 세부 할 일이 열리고, 접히는 동안에는 클릭·포커스를 받지 않다가 다 접힌 뒤 내려간다', async () => {
    render(<StudyReport stats={stats()} />);
    const overview = screen.getByRole('region', { name: '과목과 할 일별 누적' });
    const row = within(overview).getByRole('button', { name: /^블록체인/ });
    const panel = row.parentElement?.querySelector('.ui-collapse');
    expect(panel).toHaveAttribute('data-state', 'closed');
    expect(panel).toHaveAttribute('inert');
    expect(within(overview).queryByRole('list', { name: '블록체인 세부 할 일' })).not.toBeInTheDocument();

    fireEvent.click(row);
    expect(panel).toHaveAttribute('data-state', 'open');
    expect(panel).not.toHaveAttribute('inert');
    expect(row).toHaveAttribute('aria-controls', within(overview).getByRole('list', { name: '블록체인 세부 할 일' }).id);

    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('data-state', 'closed');
    expect(panel).toHaveAttribute('inert');
    expect(within(overview).getByRole('list', { name: '블록체인 세부 할 일' })).toBeInTheDocument();

    await act(async () => { running.splice(0).forEach((finish) => finish()); });
    expect(within(overview).queryByRole('list', { name: '블록체인 세부 할 일' })).not.toBeInTheDocument();
  });
});
