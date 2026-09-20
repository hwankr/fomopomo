import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

type Row = {
  id: number;
  user_id: string;
  task: string;
  subject_id: string | null;
  mode: string;
  duration: number;
  created_at: string;
  session_batch_id?: string | null;
  group_id?: string | null;
};
type Result = { data: Row[] | null; error: Error | null };
type Query = {
  operation: 'read' | 'update' | 'delete';
  filters: [string, unknown][];
  batchFilter?: string;
  payload?: { task: string | null };
};

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  notify: vi.fn(),
  queries: [] as Query[],
  rows: [] as Row[],
  readResults: [] as Promise<Result>[],
  mutationResults: [] as Promise<Result>[],
}));

vi.mock('@/lib/supabase', () => ({ supabase: { from: mock.from, auth: { getUser: mock.getUser } } }));
vi.mock('react-hot-toast', () => ({ default: { success: mock.success, error: mock.error } }));
vi.mock('@/hooks/useStudySubjects', () => ({
  useStudySubjects: () => ({ subjects: [{ id: 'blockchain', name: '블록체인' }] }),
}));
vi.mock('@/lib/studySubjects', () => ({
  STUDY_SUBJECTS_CHANGED_EVENT: 'study-subjects-changed',
  notifyStudySubjectsChanged: mock.notify,
}));

import HistoryList from '@/components/HistoryList';

const session = (userId: string) => ({ user: { id: userId } }) as Session;
const row = (overrides: Partial<Row> = {}): Row => ({
  id: 1, user_id: 'user-a', task: '블록체인 9/12 복습', subject_id: 'blockchain',
  mode: 'pomo', duration: 120, created_at: '2026-09-20T12:00:00Z', ...overrides,
});
const deferred = () => {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
};

describe('최근 활동의 작업 메모', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.queries = [];
    mock.rows = [row()];
    mock.readResults = [];
    mock.mutationResults = [];
    mock.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    vi.stubGlobal('confirm', vi.fn(() => true));
    mock.from.mockImplementation(() => {
      const query: Query = { operation: 'read', filters: [] };
      mock.queries.push(query);
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        eq: (key: string, value: unknown) => { query.filters.push([key, value]); return builder; },
        or: (filter: string) => { query.batchFilter = filter; return builder; },
        update: (payload: { task: string | null }) => { query.operation = 'update'; query.payload = payload; return builder; },
        delete: () => { query.operation = 'delete'; return builder; },
        then: (resolve: (value: Result) => unknown, reject?: (error: unknown) => unknown) => {
          const queued = query.operation === 'read' ? mock.readResults.shift() : mock.mutationResults.shift();
          const data = mock.rows.filter(item => query.filters.every(([key, value]) => item[key as keyof Row] === value));
          return (queued ?? Promise.resolve({ data, error: null })).then(resolve, reject);
        },
      };
      return builder;
    });
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('기존 메모를 그대로 열고 새 자유 텍스트만 저장하며 과목을 보존한다', async () => {
    mock.rows = [row({ task: '  블록체인 9/12 복습  ' })];
    render(<HistoryList session={session('user-a')} />);
    fireEvent.click(await screen.findByRole('button', { name: '작업 메모 수정' }));
    const input = screen.getByRole('textbox', { name: '작업 메모' });
    expect(input).toHaveValue('  블록체인 9/12 복습  ');
    expect(input).toHaveAttribute('maxlength', '200');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: '합의 알고리즘 3장 복습 + 문제 42' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByText('합의 알고리즘 3장 복습 + 문제 42');
    const update = mock.queries.find(query => query.operation === 'update');
    expect(update?.payload).toEqual({ task: '합의 알고리즘 3장 복습 + 문제 42' });
    expect(update?.filters).toEqual([['user_id', 'user-a'], ['id', 1]]);
    expect(mock.queries[0].filters).toEqual([['user_id', 'user-a']]);
    expect(screen.getByText('블록체인')).toBeInTheDocument();
    expect(mock.notify).toHaveBeenCalledOnce();
  });

  it.each(['session_batch_id', 'group_id'] as const)('%s 분할 기록을 하나로 표시하고 모든 조각의 메모를 갱신한다', async batchColumn => {
    mock.rows = [row({ [batchColumn]: 'batch-1' }), row({ id: 2, duration: 60, [batchColumn]: 'batch-1' })];
    render(<HistoryList session={session('user-a')} />);
    fireEvent.click(await screen.findByRole('button', { name: '작업 메모 수정' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('3분 0초')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: '작업 메모' }), { target: { value: '코딩테스트 123번' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByText('코딩테스트 123번');
    const update = mock.queries.find(query => query.operation === 'update');
    expect(update).toMatchObject({
      payload: { task: '코딩테스트 123번' }, filters: [['user_id', 'user-a']],
      batchFilter: 'session_batch_id.eq.batch-1,group_id.eq.batch-1',
    });
  });

  it('분할 기록 삭제도 현재 사용자와 배치로 제한한다', async () => {
    mock.rows = [row({ group_id: 'batch-2' })];
    render(<HistoryList session={session('user-a')} />);
    fireEvent.click(await screen.findByRole('button', { name: '기록 삭제' }));
    await screen.findByText('아직 기록이 없습니다.');
    expect(mock.queries.find(query => query.operation === 'delete')).toMatchObject({
      filters: [['user_id', 'user-a']], batchFilter: 'session_batch_id.eq.batch-2,group_id.eq.batch-2',
    });
  });

  it('계정을 바꾸면 이전 계정의 늦은 조회 응답을 무시한다', async () => {
    const pending = deferred();
    mock.readResults.push(pending.promise);
    const { rerender } = render(<HistoryList session={session('user-a')} />);
    await waitFor(() => expect(mock.queries).toHaveLength(1));
    mock.getUser.mockResolvedValue({ data: { user: { id: 'user-b' } } });
    mock.rows = [row({ user_id: 'user-b', task: '새 계정 메모' })];
    rerender(<HistoryList session={session('user-b')} />);
    await screen.findByText('새 계정 메모');
    await act(async () => pending.resolve({ data: [row()], error: null }));
    expect(screen.queryByText('블록체인 9/12 복습')).not.toBeInTheDocument();
    expect(screen.getByText('새 계정 메모')).toBeInTheDocument();
    expect(mock.error).not.toHaveBeenCalled();
  });

  it.each([
    ['update', '성공'], ['delete', '성공'], ['update', '실패'], ['delete', '실패'],
  ] as const)('계정 전환 전의 %s %s 응답이 새 계정의 편집 상태와 알림을 바꾸지 않는다', async (operation, outcome) => {
    const pending = deferred();
    mock.mutationResults.push(pending.promise);
    const { rerender } = render(<HistoryList session={session('user-a')} />);
    await screen.findByText('블록체인 9/12 복습');
    if (operation === 'update') {
      fireEvent.click(screen.getByRole('button', { name: '작업 메모 수정' }));
      fireEvent.change(screen.getByRole('textbox', { name: '작업 메모' }), { target: { value: '이전 계정 수정' } });
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: '기록 삭제' }));
    }
    await waitFor(() => expect(mock.queries.some(query => query.operation === operation)).toBe(true));
    mock.getUser.mockResolvedValue({ data: { user: { id: 'user-b' } } });
    mock.rows = [row({ user_id: 'user-b', task: '새 계정 메모' })];
    rerender(<HistoryList session={session('user-b')} />);
    fireEvent.click(await screen.findByRole('button', { name: '작업 메모 수정' }));
    fireEvent.change(screen.getByRole('textbox', { name: '작업 메모' }), { target: { value: '새 계정 작성 중' } });
    await act(async () => pending.resolve({ data: null, error: outcome === '실패' ? new Error('permission denied') : null }));
    expect(screen.getByRole('textbox', { name: '작업 메모' })).toHaveValue('새 계정 작성 중');
    expect(mock.success).not.toHaveBeenCalled();
    expect(mock.error).not.toHaveBeenCalled();
    expect(mock.notify).not.toHaveBeenCalled();
  });

  it('로그아웃 후 늦은 조회 오류는 표시하지 않는다', async () => {
    const pending = deferred();
    mock.readResults.push(pending.promise);
    const { rerender } = render(<HistoryList session={session('user-a')} />);
    await waitFor(() => expect(mock.queries).toHaveLength(1));
    rerender(<HistoryList session={null} />);
    expect(screen.getByRole('button', { name: '로그인하기' })).toBeInTheDocument();
    await act(async () => pending.resolve({ data: null, error: new Error('permission denied') }));
    expect(mock.error).not.toHaveBeenCalled();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
