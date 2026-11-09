import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: number; task: string; duration: number; created_at: string; subject_id: string | null; session_batch_id: string | null; group_id: string | null; user_id: string };
type Subject = { id: string; name: string; user_id: string; archived_at?: string | null };
const BLOCKCHAIN: Subject = { id: 'blockchain', name: '블록체인', user_id: 'user-a' };
const mock = vi.hoisted(() => ({
  rows: [] as Row[], rpc: vi.fn(), eq: vi.fn(), range: vi.fn(), rename: vi.fn(),
  subjects: [] as Subject[], subjectsLoading: false, subjectError: null as string | null,
}));

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
  subjects: mock.subjects, loading: mock.subjectsLoading, error: mock.subjectError,
  createSubject: vi.fn(), renameSubject: mock.rename,
}) }));

import SubjectHistoryManager from '@/components/subjects/SubjectHistoryManager';

function row(id: number, overrides: Partial<Row> = {}): Row {
  return { id, task: `블록체인 ${id} 복습`, duration: 600, created_at: new Date(2026, 8, 20, 10).toISOString(), subject_id: null, session_batch_id: null, group_id: null, user_id: 'user-a', ...overrides };
}

describe('기존 기록 과목 일괄 분류', () => {
  beforeEach(() => {
    mock.rows = [row(1), row(2)]; mock.rpc.mockReset().mockResolvedValue({ data: 2, error: null }); mock.eq.mockClear(); mock.range.mockClear();
    mock.subjects = [BLOCKCHAIN]; mock.subjectsLoading = false; mock.subjectError = null;
  });
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
    expect(screen.getByText('20분')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '표시된 기록 선택' }));
    fireEvent.change(screen.getByLabelText('변경할 과목'), { target: { value: 'blockchain' } });
    expect(screen.getByRole('status')).toHaveTextContent('선택한 기록 1개를 블록체인으로 바꿔요.');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith('classify_study_sessions', { p_session_ids: [1], p_subject_id: 'blockchain' }));
    expect(await screen.findByText('1개 기록의 과목을 정리했어요.')).toBeInTheDocument();
    expect(mock.range).toHaveBeenCalledWith(30, 529);
    expect(mock.eq).toHaveBeenCalledWith('user_id', 'user-a');
  });

  it('RPC 오류 시 선택을 유지하고 재시도로 미분류로 변경한다', async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Network' } });
    render(<SubjectHistoryManager userId="user-a" />);
    await screen.findByText('검색 결과 2개 · 표시 2개 · 선택 0개');
    fireEvent.click(screen.getByRole('button', { name: '표시된 기록 선택' }));
    expect(screen.getByRole('status')).toHaveTextContent('선택한 기록 2개를 미분류로 바꿔요.');
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('과목을 바꾸지 못했어요');
    expect(screen.getAllByRole('checkbox').every(input => (input as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByText('2개 기록을 미분류로 바꿨어요.');
    expect(mock.rpc).toHaveBeenLastCalledWith('classify_study_sessions', { p_session_ids: [1, 2], p_subject_id: null });
  });

  it('미분류 기록부터 보여 주고, 필터 변경은 숨겨진 선택을 비우며 날짜/미분류 필터를 적용한다', async () => {
    mock.rows.push(row(3, { subject_id: 'blockchain' }), row(4, { created_at: new Date(2026, 8, 19, 4).toISOString() }));
    render(<SubjectHistoryManager userId="user-a" />);
    await screen.findByText('검색 결과 3개 · 표시 3개 · 선택 0개');
    expect(screen.getByLabelText('현재 과목')).toHaveValue('unclassified');
    expect(screen.getByText('과목 없이 저장된 기록이에요. 과목을 골라 두면 통계에 함께 잡혀요.')).toBeInTheDocument();
    expect(screen.queryByText('블록체인 3 복습')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('현재 과목'), { target: { value: 'all' } });
    expect(screen.getByText('검색 결과 4개 · 표시 4개 · 선택 0개')).toBeInTheDocument();
    expect(screen.getByText('블록체인 3 복습')).toBeInTheDocument();
    expect(screen.queryByText('과목 없이 저장된 기록이에요. 과목을 골라 두면 통계에 함께 잡혀요.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '표시된 기록 선택' }));
    expect(screen.getByText('검색 결과 4개 · 표시 4개 · 선택 4개')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('현재 과목'), { target: { value: 'unclassified' } });
    expect(screen.getByText('검색 결과 3개 · 표시 3개 · 선택 0개')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('종료 공부일'), { target: { value: '2026-09-18' } });
    expect(screen.getByText('검색 결과 1개 · 표시 1개 · 선택 0개')).toBeInTheDocument();
    expect(screen.getByText('블록체인 4 복습')).toBeInTheDocument();
  });

  it.each([
    { label: '공백 없는 검색어', query: '데이터베이스' },
    { label: '띄어 쓴 검색어', query: '데이터 베이스' },
    { label: '여러 공백이 있는 검색어', query: '  데이터   베이스  ' },
    { label: '탭이 있는 검색어', query: '데이터\t베이스' },
    { label: '전각 공백이 있는 검색어', query: '데이터\u3000베이스' },
  ])('$label로 띄어쓰기가 다른 제목을 함께 찾는다', async ({ query }) => {
    mock.rows = [
      row(1, { task: '데이터 베이스 9/17 복습' }),
      row(2, { task: '데이터베이스 9/12 복습' }),
      row(3, { task: '블록체인 9/17 복습' }),
    ];
    render(<SubjectHistoryManager userId="user-a" />);
    await screen.findByText('검색 결과 3개 · 표시 3개 · 선택 0개');

    fireEvent.change(screen.getByLabelText('할 일 검색'), { target: { value: query } });

    expect(screen.getByText('검색 결과 2개 · 표시 2개 · 선택 0개')).toBeInTheDocument();
    expect(screen.getByText('데이터 베이스 9/17 복습')).toBeInTheDocument();
    expect(screen.getByText('데이터베이스 9/12 복습')).toBeInTheDocument();
    expect(screen.queryByText('블록체인 9/17 복습')).not.toBeInTheDocument();
  });

  it('띄어쓰기를 무시한 검색 결과를 원래 제목 그대로 선택하고 함께 분류한다', async () => {
    const titles = ['데이터 베이스 9/17 복습', '데이터베이스 9/12 복습'];
    mock.rows = [row(1, { task: titles[0] }), row(2, { task: titles[1] }), row(3, { task: '블록체인 9/17 복습' })];
    render(<SubjectHistoryManager userId="user-a" />);
    await screen.findByText('검색 결과 3개 · 표시 3개 · 선택 0개');
    fireEvent.change(screen.getByLabelText('할 일 검색'), { target: { value: '데이터베이스' } });

    fireEvent.click(screen.getByRole('button', { name: '표시된 기록 선택' }));

    expect(screen.getByText('검색 결과 2개 · 표시 2개 · 선택 2개')).toBeInTheDocument();
    for (const title of titles) {
      expect(screen.getByText(title).textContent).toBe(title);
      expect(screen.getByRole('checkbox', { name: `${title} 선택` })).toBeChecked();
    }
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith('classify_study_sessions', { p_session_ids: [1, 2], p_subject_id: null }));
  });

  it('공백을 무시하면서 기존 대소문자 구분 없는 검색을 유지한다', async () => {
    mock.rows = [row(1, { task: 'Data Base SQL 복습' }), row(2, { task: 'database SQL 문제' }), row(3, { task: '블록체인 복습' })];
    render(<SubjectHistoryManager userId="user-a" />);
    await screen.findByText('검색 결과 3개 · 표시 3개 · 선택 0개');

    fireEvent.change(screen.getByLabelText('할 일 검색'), { target: { value: 'dAtAbAsE' } });

    expect(screen.getByText('검색 결과 2개 · 표시 2개 · 선택 0개')).toBeInTheDocument();
    expect(screen.getByText('Data Base SQL 복습')).toBeInTheDocument();
    expect(screen.getByText('database SQL 문제')).toBeInTheDocument();
    expect(screen.queryByText('블록체인 복습')).not.toBeInTheDocument();
  });

  it('계정 전환 시 기록과 선택을 초기화하고 늦게 온 이전 저장 응답을 무시한다', async () => {
    let resolve!: (value: unknown) => void;
    mock.rpc.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    mock.rows.push(row(3, { user_id: 'user-b', task: '다른 계정의 기록' }));
    const { rerender } = render(<SubjectHistoryManager userId="user-a" />);
    await screen.findByText('검색 결과 2개 · 표시 2개 · 선택 0개');
    fireEvent.click(screen.getByRole('button', { name: '표시된 기록 선택' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    rerender(<SubjectHistoryManager userId="user-b" />);
    expect(screen.queryByText('블록체인 1 복습')).not.toBeInTheDocument();
    await act(async () => resolve({ data: 2, error: null }));
    await screen.findByText('다른 계정의 기록');
    expect(screen.queryByText('2개 기록을 미분류로 바꿨어요.')).not.toBeInTheDocument();
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
  it('과목 관리에서 지운 과목이 다 불러온 목록에서 빠지면 변경할 과목을 미분류로 되돌린다', async () => {
    const english = { id: 'english', name: '영어', user_id: 'user-a' };
    mock.subjects = [BLOCKCHAIN, english];
    const view = render(<SubjectHistoryManager userId="user-a" />);
    await screen.findByText('검색 결과 2개 · 표시 2개 · 선택 0개');
    fireEvent.click(screen.getByRole('button', { name: '표시된 기록 선택' }));
    fireEvent.change(screen.getByLabelText('변경할 과목'), { target: { value: 'english' } });
    expect(screen.getByRole('status')).toHaveTextContent('선택한 기록 2개를 영어로 바꿔요.');

    // 다시 불러오는 중이거나 불러오기에 실패한 목록으로는 판단하지 않는다.
    mock.subjects = [BLOCKCHAIN];
    mock.subjectsLoading = true;
    view.rerender(<SubjectHistoryManager userId="user-a" />);
    expect(screen.getByLabelText('변경할 과목')).toHaveValue('english');
    mock.subjectsLoading = false;
    mock.subjectError = '과목을 불러오지 못했습니다. 다시 시도해주세요.';
    view.rerender(<SubjectHistoryManager userId="user-a" />);
    expect(screen.getByLabelText('변경할 과목')).toHaveValue('english');

    mock.subjectError = null;
    view.rerender(<SubjectHistoryManager userId="user-a" />);
    expect(screen.getByLabelText('변경할 과목')).toHaveValue('__unclassified__');
    expect(screen.getByRole('status')).toHaveTextContent('선택한 기록 2개를 미분류로 바꿔요.');
    // 다시 불러와도 지운 과목으로 돌아가지 않는다.
    mock.subjectError = '과목을 불러오지 못했습니다. 다시 시도해주세요.';
    view.rerender(<SubjectHistoryManager userId="user-a" />);
    expect(screen.getByLabelText('변경할 과목')).toHaveValue('__unclassified__');
    mock.subjectError = null;
    view.rerender(<SubjectHistoryManager userId="user-a" />);
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith('classify_study_sessions', { p_session_ids: [1, 2], p_subject_id: null }));
  });

  describe('보관한 과목', () => {
    const ENGLISH: Subject = { id: 'english', name: '영어', user_id: 'user-a', archived_at: '2026-11-09T01:00:00.000Z' };
    const MATH: Subject = { id: 'math', name: '수학', user_id: 'user-a', archived_at: null };
    const optionLabels = (label: string) => Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map(option => option.textContent);
    beforeEach(() => {
      // 훅의 목록처럼 이름순이고 보관한 과목도 들어 있다.
      mock.subjects = [BLOCKCHAIN, MATH, ENGLISH];
      mock.rows = [
        row(1, { task: '영어 단어 1일차', subject_id: 'english' }),
        row(2, { task: '영어 단어 2일차', subject_id: 'english', duration: 1200 }),
        row(3, { task: '블록체인 복습', subject_id: 'blockchain' }),
        row(4, { task: '토익 모의고사' }),
      ];
    });

    it('현재 과목 필터에 사용 중 과목 뒤로 보관한 과목이 (보관)과 함께 있고, 그 과목 기록만 거른다', async () => {
      render(<SubjectHistoryManager userId="user-a" />);
      await screen.findByText('검색 결과 1개 · 표시 1개 · 선택 0개');
      expect(optionLabels('현재 과목')).toEqual(['모든 과목', '미분류', '블록체인', '수학', '영어 (보관)']);
      fireEvent.change(screen.getByLabelText('현재 과목'), { target: { value: 'english' } });
      expect(screen.getByText('검색 결과 2개 · 표시 2개 · 선택 0개')).toBeInTheDocument();
      expect(screen.getByText('영어 단어 1일차')).toBeInTheDocument();
      expect(screen.getByText('영어 단어 2일차')).toBeInTheDocument();
      expect(screen.queryByText('블록체인 복습')).not.toBeInTheDocument();
      expect(screen.queryByText('토익 모의고사')).not.toBeInTheDocument();
      // 기록 줄의 과목 이름 표시는 이름만이다.
      expect(screen.getByText('영어 단어 1일차').nextElementSibling).toHaveTextContent(/· 영어$/);
    });

    it('변경할 과목에도 보관한 과목이 있어 지난 기록을 옮길 수 있고, 다시 불러와도 미분류로 되돌리지 않는다', async () => {
      const view = render(<SubjectHistoryManager userId="user-a" />);
      await screen.findByText('검색 결과 1개 · 표시 1개 · 선택 0개');
      expect(optionLabels('변경할 과목')).toEqual(['미분류', '블록체인', '수학', '영어 (보관)']);
      fireEvent.click(screen.getByRole('button', { name: '표시된 기록 선택' }));
      fireEvent.change(screen.getByLabelText('변경할 과목'), { target: { value: 'english' } });
      expect(screen.getByLabelText('변경할 과목')).toHaveValue('english');
      expect(screen.getByRole('status')).toHaveTextContent('선택한 기록 1개를 영어로 바꿔요.');
      // 보관한 과목은 목록에 남으므로 '지운 과목' 규칙으로 되돌리지 않는다.
      view.rerender(<SubjectHistoryManager userId="user-a" />);
      expect(screen.getByLabelText('변경할 과목')).toHaveValue('english');
      expect(optionLabels('변경할 과목')).toEqual(['미분류', '블록체인', '수학', '영어 (보관)']);
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
      await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith('classify_study_sessions', { p_session_ids: [4], p_subject_id: 'english' }));
      expect(await screen.findByText('1개 기록의 과목을 정리했어요.')).toBeInTheDocument();
    });
  });

  it('저장 결과만 살짝 나타나고 고르는 동안의 개수 안내는 그대로 바뀐다', async () => {
    render(<SubjectHistoryManager userId="user-a" />);
    await screen.findByText('검색 결과 2개 · 표시 2개 · 선택 0개');
    fireEvent.click(screen.getByRole('button', { name: '표시된 기록 선택' }));
    expect(screen.getByRole('status').querySelector('.animate-fade-in')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('2개 기록을 미분류로 바꿨어요.')).toHaveClass('animate-fade-in');
  });
});
