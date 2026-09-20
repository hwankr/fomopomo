import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: number; task: string; duration: number; created_at: string; subject_id: string | null; session_batch_id: string | null; group_id: string | null; user_id: string };
const mock = vi.hoisted(() => ({ rows: [] as Row[], rpc: vi.fn(), eq: vi.fn(), range: vi.fn(), rename: vi.fn() }));

// The primitive suites cover popover keyboard/calendar behavior. These boundaries
// keep this suite focused on filtering, complete batches and mutation ownership.
vi.mock('@/components/ui/AppSelect', () => ({ default: ({ value, onValueChange, options, label, disabled }: {
  value: string; onValueChange: (value: string) => void; options: { value: string; label: string }[]; label?: string; disabled?: boolean;
}) => <label>{label}<select value={value} disabled={disabled} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> }));
vi.mock('@/components/ui/DatePicker', () => ({ default: ({ value, onChange, label, min, max, disabled }: {
  value: string; onChange: (value: string) => void; label: string; min?: string; max?: string; disabled?: boolean;
}) => <label>{label}<input value={value} min={min} max={max} disabled={disabled} onChange={event => onChange(event.target.value)} /></label> }));
vi.mock('@/components/subjects/SubjectManager', () => ({ default: () => <p>공통 과목 관리</p> }));

vi.mock('@/lib/supabase', () => ({ supabase: {
  rpc: mock.rpc,
  from: vi.fn(() => {
    let owner = '';
    let from = 0;
    const builder = {
      select: vi.fn(() => builder),
      eq: (key: string, value: string) => { mock.eq(key, value); owner = value; return builder; },
      order: vi.fn(() => builder),
      range: (start: number, end: number) => { from = start; mock.range(start, end); return builder; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: mock.rows.filter(row => row.user_id === owner).slice(from, from + 10), error: null }).then(resolve),
    };
    return builder;
  }),
} }));

vi.mock('@/hooks/useStudySubjects', () => ({ useStudySubjects: () => ({
  subjects: [{ id: 'blockchain', name: '블록체인', user_id: 'user-a' }], loading: false, error: null,
  createSubject: vi.fn(), renameSubject: mock.rename,
}) }));

import SubjectHistoryManager from '@/components/subjects/SubjectHistoryManager';

function row(id: number, overrides: Partial<Row> = {}): Row {
  return { id, task: `블록체인 ${id} 복습`, duration: 600, created_at: new Date(2026, 8, 20, 10).toISOString(), subject_id: null, session_batch_id: null, group_id: null, user_id: 'user-a', ...overrides };
}

describe('기존 기록 과목 일괄 분류', () => {
  beforeEach(() => { mock.rows = [row(1), row(2)]; mock.rpc.mockReset().mockResolvedValue({ data: 2, error: null }); mock.eq.mockClear(); mock.range.mockClear(); });
  afterEach(cleanup);

  it('짧은 서버 페이지도 끝까지 검색하고 논리 기록으로 묶어 선택 및 과목 적용한다', async () => {
    mock.rows = [row(1, { task: '블록체인 배치 복습', session_batch_id: 'batch' }), row(2, { task: '블록체인 배치 복습', group_id: 'batch' }), ...Array.from({ length: 34 }, (_, i) => row(i + 3))];
    render(<SubjectHistoryManager userId="user-a" />);
    await screen.findByText('검색 결과 35개 · 표시 30개 · 선택 0개');
    expect(screen.getAllByRole('checkbox')).toHaveLength(30);
    fireEvent.click(screen.getByRole('button', { name: /더 보기/ }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(35);
    fireEvent.change(screen.getByLabelText('할 일 검색'), { target: { value: '배치' } });
    expect(screen.getByText('검색 결과 1개 · 표시 1개 · 선택 0개')).toBeInTheDocument();
    expect(screen.getByText('0h 20m')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '표시된 기록 선택' }));
    fireEvent.change(screen.getByLabelText('변경할 과목'), { target: { value: 'blockchain' } });
    fireEvent.click(screen.getByRole('button', { name: '선택 1개 과목 적용' }));
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith('classify_study_sessions', { p_session_ids: [1], p_subject_id: 'blockchain' }));
    expect(await screen.findByText('1개 기록의 과목을 변경했습니다.')).toBeInTheDocument();
    expect(mock.range).toHaveBeenCalledWith(30, 529);
    expect(mock.eq).toHaveBeenCalledWith('user_id', 'user-a');
  });

  it('RPC 오류 시 선택을 유지하고 재시도로 미분류로 변경한다', async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Network' } });
    render(<SubjectHistoryManager userId="user-a" />);
    await screen.findByText('검색 결과 2개 · 표시 2개 · 선택 0개');
    fireEvent.click(screen.getByRole('button', { name: '표시된 기록 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '선택 2개 미분류로 변경' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('과목을 변경하지 못했습니다');
    expect(screen.getAllByRole('checkbox').every(input => (input as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '선택 2개 미분류로 변경' }));
    await screen.findByText('2개 기록의 과목을 해제했습니다.');
    expect(mock.rpc).toHaveBeenLastCalledWith('classify_study_sessions', { p_session_ids: [1, 2], p_subject_id: null });
  });

  it('필터 변경은 숨겨진 선택을 비우며 날짜/미분류 필터를 적용한다', async () => {
    mock.rows.push(row(3, { subject_id: 'blockchain' }), row(4, { created_at: new Date(2026, 8, 19, 4).toISOString() }));
    render(<SubjectHistoryManager userId="user-a" />);
    await screen.findByText('검색 결과 4개 · 표시 4개 · 선택 0개');
    fireEvent.click(screen.getByRole('button', { name: '표시된 기록 선택' }));
    fireEvent.change(screen.getByLabelText('현재 과목'), { target: { value: 'unclassified' } });
    expect(screen.getByText('검색 결과 3개 · 표시 3개 · 선택 0개')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('종료 공부일'), { target: { value: '2026-09-18' } });
    expect(screen.getByText('검색 결과 1개 · 표시 1개 · 선택 0개')).toBeInTheDocument();
    expect(screen.getByText('블록체인 4 복습')).toBeInTheDocument();
  });

  it('계정 전환 시 기록과 선택을 초기화하고 늦게 온 이전 저장 응답을 무시한다', async () => {
    let resolve!: (value: unknown) => void;
    mock.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    mock.rows.push(row(3, { user_id: 'user-b', task: '다른 계정의 기록' }));
    const { rerender } = render(<SubjectHistoryManager userId="user-a" />);
    await screen.findByText('검색 결과 2개 · 표시 2개 · 선택 0개');
    fireEvent.click(screen.getByRole('button', { name: '표시된 기록 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '선택 2개 미분류로 변경' }));
    rerender(<SubjectHistoryManager userId="user-b" />);
    expect(screen.queryByText('블록체인 1 복습')).not.toBeInTheDocument();
    await act(async () => resolve({ data: 2, error: null }));
    await screen.findByText('다른 계정의 기록');
    expect(screen.queryByText('2개 기록의 과목을 해제했습니다.')).not.toBeInTheDocument();
    expect(screen.getByText('검색 결과 1개 · 표시 1개 · 선택 0개')).toBeInTheDocument();
  });

  it('날짜 필터를 지울 수 있고 시작일보다 이른 종료일을 허용하지 않는다', async () => {
    render(<SubjectHistoryManager userId="user-a" />);
    await screen.findByText('검색 결과 2개 · 표시 2개 · 선택 0개');
    fireEvent.change(screen.getByLabelText('시작 공부일'), { target: { value: '2026-09-20' } });
    fireEvent.change(screen.getByLabelText('종료 공부일'), { target: { value: '2026-09-19' } });
    expect(screen.getByLabelText('종료 공부일')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('종료 공부일'), { target: { value: '2026-09-21' } });
    fireEvent.change(screen.getByLabelText('시작 공부일'), { target: { value: '2026-09-22' } });
    expect(screen.getByLabelText('시작 공부일')).toHaveValue('2026-09-20');
    fireEvent.change(screen.getByLabelText('시작 공부일'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('종료 공부일'), { target: { value: '' } });
    expect(screen.getByLabelText('시작 공부일')).toHaveValue('');
    expect(screen.getByLabelText('종료 공부일')).toHaveValue('');
    expect(screen.getByText('검색 결과 2개 · 표시 2개 · 선택 0개')).toBeInTheDocument();
    expect(screen.getByText('공통 과목 관리')).toBeInTheDocument();
  });
});
