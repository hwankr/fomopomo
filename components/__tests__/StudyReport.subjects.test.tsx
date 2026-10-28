import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addMonths, format } from 'date-fns';
import type { ChartData } from '@/hooks/useStudyStats';

const mock = vi.hoisted(() => ({
  userId: 'user-a',
  name: '블록체인',
  fetchStats: vi.fn(),
  chartData: [] as ChartData[],
  empty: false,
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/hooks/useAuthSession', () => ({ useAuthSession: () => ({ session: { user: { id: mock.userId } } }) }));
vi.mock('@/hooks/useStudySubjects', () => ({ useStudySubjects: () => ({ subjects: [
  { id: 'blockchain', user_id: mock.userId, name: mock.name },
  { id: 'another', user_id: mock.userId, name: mock.name },
], error: null }) }));
vi.mock('@/components/subjects/SubjectHistoryManager', () => ({ default: () => <p>과목 정리 화면</p> }));

import StudyReport, { type StudyStats } from '@/components/StudyReport';
import { summarizeStudySessions } from '@/hooks/useStudyStats';

// 페이지가 넘겨주는 useStudyStats 결과(머리와 함께 쓰는 집계)
function stats(): StudyStats {
  return {
    loading: false, error: null, totalFocusTime: 8400, todayFocusTime: 4800, earliestYear: 2026, heatmapData: [],
    chartData: mock.chartData, fetchStats: mock.fetchStats,
    periodTotals: summarizeStudySessions(mock.empty ? [] : [
      { task: '블록체인 9/12 복습', subject_id: 'blockchain', duration: 1800, created_at: '' },
      { task: '블록체인 9/19 복습', subject_id: 'blockchain', duration: 3000, created_at: '' },
      { task: '다른 과목의 할 일', subject_id: 'another', duration: 600, created_at: '' },
    ]),
    lifetimeTotals: summarizeStudySessions(mock.empty ? [] : [{ task: '과거 할 일', subject_id: 'blockchain', duration: 8400, created_at: '' }]),
  };
}

function bucket(bucketKey: string, seconds: number, taskTotals: Record<string, number> = {}): ChartData {
  return { name: bucketKey, hours: seconds / 3600, seconds, taskTotals, bucketKey, displayLabel: bucketKey, breakdownLabel: '' };
}

describe('공부 기록 과목별 통계', () => {
  beforeEach(() => { mock.name = '블록체인'; mock.chartData = []; mock.empty = false; mock.fetchStats.mockClear(); });
  afterEach(cleanup);

  it('선택 기간의 과목 합계와 세부 할 일을 보여주고 전체 누적 및 할 일별로 전환한다', () => {
    render(<StudyReport stats={stats()} />);
    const overview = screen.getByRole('region', { name: '과목과 할 일별 누적' });
    expect(within(overview).getByText('합계 1시간 30분')).toBeInTheDocument();
    const subjectRow = within(overview).getByText('1시간 20분').closest('button')!;
    expect(subjectRow).toHaveTextContent('블록체인');
    expect(subjectRow).toHaveTextContent('88.9%');
    expect(subjectRow).toHaveAttribute('aria-expanded', 'false');
    expect(within(overview).queryByText('블록체인 9/12 복습')).not.toBeInTheDocument();
    fireEvent.click(subjectRow);
    expect(subjectRow).toHaveAttribute('aria-expanded', 'true');
    const tasks = within(overview).getByRole('list', { name: '블록체인 세부 할 일' });
    expect(within(tasks).getByText('블록체인 9/12 복습')).toBeInTheDocument();
    expect(within(tasks).getByText('50분')).toBeInTheDocument();
    fireEvent.click(subjectRow);
    expect(subjectRow).toHaveAttribute('aria-expanded', 'false');
    // Identical display names remain separate subject rows.
    const subjectRows = within(overview).getAllByRole('button', { name: /^블록체인/ });
    expect(subjectRows).toHaveLength(2);
    expect(subjectRows.every(button => button.hasAttribute('aria-expanded'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '할 일별' }));
    expect(screen.getByRole('button', { name: '할 일별' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(overview).queryAllByRole('button', { name: /^블록체인/ })).toHaveLength(0);
    expect(within(overview).getByText('블록체인 9/19 복습')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '전체 누적' }));
    expect(within(overview).getByText('합계 2시간 20분')).toBeInTheDocument();
    expect(within(overview).getByText('과거 할 일')).toBeInTheDocument();
    expect(within(overview).queryByText('블록체인 9/19 복습')).not.toBeInTheDocument();
  });

  it('막대마다 값과 이름을 보여 주고, 막대를 고르면 그 기간의 작업별 시간을 보여 준다', () => {
    mock.chartData = [
      bucket('2026-10-26', 7500, { '알고리즘 문제 풀기': 3900, '영어 단어 100개': 3600 }),
      bucket('2026-10-27', 9000, { '통계 과제': 9000 }),
      bucket('2026-10-28', 0),
    ];
    render(<StudyReport stats={stats()} />);
    const monday = screen.getByRole('button', { name: '10월 26일 월요일, 2시간 5분' });
    expect(monday).toHaveTextContent('2h 5m');
    expect(monday).toHaveTextContent('월');
    const empty = screen.getByRole('button', { name: '10월 28일 수요일, 기록 없음' });

    fireEvent.click(monday);
    expect(monday).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: '10월 26일 작업별 집중 시간' })).toBeInTheDocument();
    const chips = screen.getByText('알고리즘 문제 풀기').closest('ul')!;
    expect(within(chips).getAllByRole('listitem').map(item => item.textContent)).toEqual(['알고리즘 문제 풀기1시간 5분', '영어 단어 100개1시간']);

    fireEvent.click(empty);
    expect(monday).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('heading', { name: '10월 28일 작업별 집중 시간' })).toBeInTheDocument();
    expect(screen.getByText('기록이 없어요.')).toBeInTheDocument();
  });

  it('연간 막대 값은 모바일에서 반올림한 시간, 데스크톱에서 정확한 값이고 이름과 작업별 시간은 정확하다', () => {
    mock.chartData = [
      bucket('2026-09', 69 * 3600 + 35 * 60, { '통계 과제': 69 * 3600 + 35 * 60 }),
      bucket('2026-10', 64 * 3600 + 44 * 60),
      bucket('2026-11', 20 * 60),
    ];
    render(<StudyReport stats={stats()} />);
    fireEvent.click(screen.getByRole('button', { name: '연간' }));
    const september = screen.getByRole('button', { name: '2026년 9월, 69시간 35분' });
    expect(within(september).getByText('70h')).toHaveClass('md:hidden');
    expect(within(september).getByText('69h 35m')).toHaveClass('max-md:hidden');
    expect(within(september).getByText('9월')).toBeInTheDocument();
    const october = screen.getByRole('button', { name: '2026년 10월, 64시간 44분' });
    expect(within(october).getByText('65h')).toHaveClass('md:hidden');
    // 1시간이 안 되면 0h 대신 분으로 보인다.
    expect(within(screen.getByRole('button', { name: '2026년 11월, 20분' })).getAllByText('20m')).toHaveLength(2);

    fireEvent.click(september);
    expect(screen.getByRole('heading', { name: '2026년 9월 작업별 집중 시간' })).toBeInTheDocument();
    expect(screen.getByText('통계 과제').nextElementSibling).toHaveTextContent('69시간 35분');
  });

  it('기간 단위를 바꾸고 이전/다음으로 넘기며 지금으로 돌아온다', async () => {
    render(<StudyReport stats={stats()} />);
    expect(screen.getByRole('button', { name: '주간' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '다음 주' })).toBeDisabled();
    await waitFor(() => expect(mock.fetchStats).toHaveBeenLastCalledWith('week', expect.any(Date), 'user-a'));

    fireEvent.click(screen.getByRole('button', { name: '월간' }));
    const thisMonth = format(new Date(), 'yyyy년 M월');
    expect(screen.getByRole('button', { name: thisMonth })).toHaveAttribute('title', '이번 달로 이동');
    expect(screen.getByRole('button', { name: '다음 달' })).toBeDisabled();
    await waitFor(() => expect(mock.fetchStats).toHaveBeenLastCalledWith('month', expect.any(Date), 'user-a'));

    fireEvent.click(screen.getByRole('button', { name: '이전 달' }));
    const lastMonth = format(addMonths(new Date(), -1), 'yyyy년 M월');
    expect(screen.getByRole('button', { name: lastMonth })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 달' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: lastMonth }));
    expect(screen.getByRole('button', { name: thisMonth })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '연간' }));
    const year = new Date().getFullYear();
    expect(screen.getByRole('button', { name: `${year}년` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 년도' })).toBeDisabled();
    // 기록은 2026년부터라 그 앞으로는 넘어가지 않는다.
    if (year === 2026) expect(screen.getByRole('button', { name: '이전 년도' })).toBeDisabled();
    await waitFor(() => expect(mock.fetchStats).toHaveBeenLastCalledWith('year', new Date(year, 0, 1), 'user-a'));
  });

  it('과목 이름 변경을 반영하고 기존 기록 정리를 열 수 있다', () => {
    const { rerender } = render(<StudyReport stats={stats()} />);
    mock.name = '블록체인 심화';
    rerender(<StudyReport stats={stats()} />);
    expect(screen.getAllByText('블록체인 심화')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '기존 기록 과목 정리' }));
    expect(screen.getByText('과목 정리 화면')).toBeInTheDocument();
  });

  it('기록이 하나도 없으면 첫 뽀모도로 안내를 보여 준다', () => {
    mock.empty = true;
    render(<StudyReport stats={stats()} />);
    const overview = screen.getByRole('region', { name: '과목과 할 일별 누적' });
    expect(within(overview).getByText('합계 0분')).toBeInTheDocument();
    expect(within(overview).getByText('아직 기록이 없어요. 첫 뽀모도로를 시작하면 여기에 쌓여요.')).toBeInTheDocument();
    expect(screen.getByText('기록이 없어요.')).toBeInTheDocument();
  });
});
