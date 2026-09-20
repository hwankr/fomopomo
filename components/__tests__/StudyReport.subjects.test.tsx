import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const mock = vi.hoisted(() => ({
  userId: 'user-a',
  name: '블록체인',
  fetchStats: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/hooks/useAuthSession', () => ({ useAuthSession: () => ({ session: { user: { id: mock.userId } } }) }));
vi.mock('@/hooks/useStudySubjects', () => ({ useStudySubjects: () => ({ subjects: [
  { id: 'blockchain', user_id: mock.userId, name: mock.name },
  { id: 'another', user_id: mock.userId, name: mock.name },
], error: null }) }));
vi.mock('@/components/subjects/SubjectHistoryManager', () => ({ default: () => <p>과목 정리 화면</p> }));
vi.mock('recharts', () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { BarChart: Wrapper, Bar: Wrapper, ResponsiveContainer: Wrapper, XAxis: () => null, YAxis: () => null, Tooltip: () => null, Cell: () => null, CartesianGrid: () => null };
});
vi.mock('@/hooks/useStudyStats', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useStudyStats')>();
  const period = actual.summarizeStudySessions([
    { task: '블록체인 9/12 복습', subject_id: 'blockchain', duration: 1800, created_at: '' },
    { task: '블록체인 9/19 복습', subject_id: 'blockchain', duration: 3000, created_at: '' },
    { task: '다른 과목의 할 일', subject_id: 'another', duration: 600, created_at: '' },
  ]);
  return { ...actual, useStudyStats: () => ({
    loading: false, totalFocusTime: 8400, todayFocusTime: 4800, earliestYear: 2026,
    chartData: [], fetchStats: mock.fetchStats, periodTotals: period,
    lifetimeTotals: actual.summarizeStudySessions([{ task: '과거 할 일', subject_id: 'blockchain', duration: 8400, created_at: '' }]),
  }) };
});

import StudyReport from '@/components/StudyReport';

describe('공부 기록 과목별 통계', () => {
  beforeEach(() => { mock.name = '블록체인'; });
  afterEach(cleanup);

  it('선택 기간의 과목 합계와 세부 할 일을 보여주고 전체 누적 및 할 일별로 전환한다', () => {
    render(<StudyReport />);
    const overview = screen.getByRole('region', { name: '과목과 할 일별 누적 통계' });
    expect(within(overview).getByText('합계 1h 30m')).toBeInTheDocument();
    const summary = within(overview).getByText('1h 20m').closest('summary')!;
    expect(summary).toHaveTextContent('블록체인');
    fireEvent.click(summary);
    expect(summary.parentElement).toHaveAttribute('open');
    expect(within(summary.parentElement!).getByText('블록체인 9/12 복습')).toBeInTheDocument();
    // Identical display names remain separate subject rows.
    expect(overview.querySelectorAll('details')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '할 일별' }));
    expect(overview.querySelectorAll('details')).toHaveLength(0);
    expect(within(overview).getByText('블록체인 9/19 복습')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '전체 누적' }));
    expect(within(overview).getByText('합계 2h 20m')).toBeInTheDocument();
    expect(within(overview).getByText('과거 할 일')).toBeInTheDocument();
    expect(within(overview).queryByText('블록체인 9/19 복습')).not.toBeInTheDocument();
  });

  it('과목 이름 변경을 반영하고 기존 기록 정리를 열 수 있다', () => {
    const { rerender } = render(<StudyReport />);
    mock.name = '블록체인 심화';
    rerender(<StudyReport />);
    expect(screen.getAllByText('블록체인 심화')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '기존 기록 과목 정리' }));
    expect(screen.getByText('과목 정리 화면')).toBeInTheDocument();
  });
});
