import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

type Row = {
  id: number;
  user_id: string;
  task: string | null;
  subject_id: string | null;
  mode: string;
  duration: number;
  created_at: string;
  session_batch_id?: string | null;
  group_id?: string | null;
};
type Result = { data: Row[] | null; error: Error | null };
type RpcResult = { data: number | null; error: Error | null };
type Query = {
  operation: 'read' | 'update' | 'delete';
  filters: [string, unknown][];
  since?: string;
  range?: [number, number];
  batchFilter?: string;
  payload?: { task: string | null };
};

const mock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  notify: vi.fn(),
  queries: [] as Query[],
  rows: [] as Row[],
  // 최근 활동 목록 조회(limit)에만 순서대로 쓰는 응답. 7일 집계 조회(range)는 항상 rows에서 읽는다.
  listResults: [] as Promise<Result>[],
  mutationResults: [] as Promise<Result>[],
  rpcResults: [] as Promise<RpcResult>[],
  subjects: [] as { id: string; name: string }[],
}));

vi.mock('@/lib/supabase', () => ({ supabase: { from: mock.from, rpc: mock.rpc, auth: { getUser: mock.getUser } } }));
vi.mock('react-hot-toast', () => ({ default: { success: mock.success, error: mock.error } }));
vi.mock('@/hooks/useStudySubjects', () => ({
  useStudySubjects: () => ({ subjects: mock.subjects }),
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
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
};
const readQueries = () => mock.queries.filter(query => query.operation === 'read' && !query.range);
const recordButton = (name: string | RegExp) => screen.findByRole('button', { name });
const setDesktop = (desktop: boolean) => {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: desktop, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })));
};

async function chooseSubject(name: string) {
  const trigger = screen.getByRole('combobox', { name: '과목' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  await screen.findByRole('listbox');
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('최근 활동', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.queries = [];
    mock.rows = [row()];
    mock.listResults = [];
    mock.mutationResults = [];
    mock.rpcResults = [];
    mock.subjects = [{ id: 'blockchain', name: '블록체인' }, { id: 'english', name: '영어' }];
    setDesktop(true);
    mock.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } } });
    mock.rpc.mockImplementation(() => mock.rpcResults.shift() ?? Promise.resolve({ data: 1, error: null }));
    mock.from.mockImplementation(() => {
      const query: Query = { operation: 'read', filters: [] };
      mock.queries.push(query);
      const builder = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        eq: (key: string, value: unknown) => { query.filters.push([key, value]); return builder; },
        gte: (key: string, value: string) => { query.since = value; return builder; },
        range: (from: number, to: number) => { query.range = [from, to]; return builder; },
        or: (filter: string) => { query.batchFilter = filter; return builder; },
        update: (payload: { task: string | null }) => { query.operation = 'update'; query.payload = payload; return builder; },
        delete: () => { query.operation = 'delete'; return builder; },
        then: (resolve: (value: Result) => unknown, reject?: (error: unknown) => unknown) => {
          let data = mock.rows.filter(item => query.filters.every(([key, value]) => item[key as keyof Row] === value));
          if (query.since) data = data.filter(item => new Date(item.created_at) >= new Date(query.since!));
          if (query.range) data = data.slice(query.range[0], query.range[1] + 1);
          const queued = query.operation !== 'read' ? mock.mutationResults.shift() : query.range ? undefined : mock.listResults.shift();
          return (queued ?? Promise.resolve({ data, error: null })).then(resolve, reject);
        },
      };
      return builder;
    });
  });

  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  describe('기록 편집', () => {
    it('행을 누르면 펼친 편집기에서 메모만 저장하고 과목을 보존한다', async () => {
      mock.rows = [row({ task: '  블록체인 9/12 복습  ' })];
      render(<HistoryList session={session('user-a')} />);
      const rowButton = await recordButton(/블록체인 9\/12 복습/);
      expect(rowButton).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(rowButton);
      expect(rowButton).toHaveAttribute('aria-expanded', 'true');
      const input = screen.getByRole('textbox', { name: '작업 메모' });
      expect(input).toHaveValue('  블록체인 9/12 복습  ');
      expect(input).toHaveAttribute('maxlength', '200');
      await waitFor(() => expect(input).toHaveFocus());
      expect(screen.getByRole('combobox', { name: '과목' })).toHaveTextContent('블록체인');
      fireEvent.change(input, { target: { value: '합의 알고리즘 3장 복습 + 문제 42' } });
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
      await screen.findByText('합의 알고리즘 3장 복습 + 문제 42');
      const update = mock.queries.find(query => query.operation === 'update');
      expect(update?.payload).toEqual({ task: '합의 알고리즘 3장 복습 + 문제 42' });
      expect(update?.filters).toEqual([['user_id', 'user-a'], ['id', 1]]);
      expect(mock.queries[0].filters).toEqual([['user_id', 'user-a']]);
      expect(mock.rpc).not.toHaveBeenCalled();
      expect(screen.getByText('블록체인')).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: '작업 메모' })).not.toBeInTheDocument();
      expect(rowButton).toHaveFocus();
      expect(mock.notify).toHaveBeenCalledOnce();
    });

    it.each(['session_batch_id', 'group_id'] as const)('%s 분할 기록을 하나로 표시하고 모든 조각의 메모를 갱신한다', async batchColumn => {
      mock.rows = [row({ [batchColumn]: 'batch-1' }), row({ id: 2, duration: 60, [batchColumn]: 'batch-1' })];
      render(<HistoryList session={session('user-a')} />);
      fireEvent.click(await recordButton(/블록체인 9\/12 복습/));
      expect(within(screen.getByRole('region', { name: '최근 활동 목록' })).getAllByRole('listitem')).toHaveLength(1);
      expect(screen.getByText('3분')).toBeInTheDocument();
      fireEvent.change(screen.getByRole('textbox', { name: '작업 메모' }), { target: { value: '코딩테스트 123번' } });
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
      await screen.findByText('코딩테스트 123번');
      const update = mock.queries.find(query => query.operation === 'update');
      expect(update).toMatchObject({
        payload: { task: '코딩테스트 123번' }, filters: [['user_id', 'user-a']],
        batchFilter: 'session_batch_id.eq.batch-1,group_id.eq.batch-1',
      });
    });

    it('과목을 바꾸면 분류 RPC로 분할 기록의 모든 조각을 바꾸고 메모는 건드리지 않는다', async () => {
      mock.rows = [row({ session_batch_id: 'batch-3' }), row({ id: 2, duration: 60, session_batch_id: 'batch-3' })];
      render(<HistoryList session={session('user-a')} />);
      fireEvent.click(await recordButton(/블록체인 9\/12 복습/));
      await chooseSubject('영어');
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
      await waitFor(() => expect(mock.success).toHaveBeenCalledOnce());
      expect(mock.rpc).toHaveBeenCalledWith('classify_study_sessions', { p_session_ids: [1, 2], p_subject_id: 'english' });
      expect(mock.queries.some(query => query.operation === 'update')).toBe(false);
      expect(screen.getByText('영어')).toBeInTheDocument();
      expect(mock.notify).toHaveBeenCalledOnce();
    });

    it('미분류로 바꾸면 과목 ID 없이 분류한다', async () => {
      render(<HistoryList session={session('user-a')} />);
      fireEvent.click(await recordButton(/블록체인 9\/12 복습/));
      await chooseSubject('미분류');
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
      await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith('classify_study_sessions', { p_session_ids: [1], p_subject_id: null }));
      expect(await screen.findByText('미분류')).toBeInTheDocument();
    });

    it('과목 변경이 실패하면 편집기를 열어 두고 오류를 알린다', async () => {
      mock.rpcResults.push(Promise.resolve({ data: null, error: new Error('permission denied') }));
      render(<HistoryList session={session('user-a')} />);
      fireEvent.click(await recordButton(/블록체인 9\/12 복습/));
      await chooseSubject('영어');
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
      await waitFor(() => expect(mock.error).toHaveBeenCalledOnce());
      expect(screen.getByRole('textbox', { name: '작업 메모' })).toBeInTheDocument();
      expect(mock.success).not.toHaveBeenCalled();
      expect(mock.notify).not.toHaveBeenCalled();
    });

    it('바꾼 것이 없으면 요청 없이 닫고, Escape는 저장하지 않고 닫는다', async () => {
      render(<HistoryList session={session('user-a')} />);
      const rowButton = await recordButton(/블록체인 9\/12 복습/);
      fireEvent.click(rowButton);
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
      expect(screen.queryByRole('textbox', { name: '작업 메모' })).not.toBeInTheDocument();

      fireEvent.click(rowButton);
      const input = screen.getByRole('textbox', { name: '작업 메모' });
      fireEvent.change(input, { target: { value: '버릴 메모' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByRole('textbox', { name: '작업 메모' })).not.toBeInTheDocument();
      expect(rowButton).toHaveFocus();
      expect(mock.queries.some(query => query.operation === 'update')).toBe(false);
      expect(mock.rpc).not.toHaveBeenCalled();
    });

    it('Enter로 저장한다(폼 제출)', async () => {
      render(<HistoryList session={session('user-a')} />);
      fireEvent.click(await recordButton(/블록체인 9\/12 복습/));
      const input = screen.getByRole('textbox', { name: '작업 메모' });
      fireEvent.change(input, { target: { value: 'Enter 메모' } });
      fireEvent.submit(input.closest('form')!);
      await screen.findByText('Enter 메모');
      expect(mock.queries.find(query => query.operation === 'update')?.payload).toEqual({ task: 'Enter 메모' });
    });

    it('분할 기록 삭제는 확인 후 현재 사용자와 배치로 제한한다', async () => {
      mock.rows = [row({ group_id: 'batch-2' })];
      render(<HistoryList session={session('user-a')} />);
      fireEvent.click(await recordButton(/블록체인 9\/12 복습/));
      fireEvent.click(screen.getByRole('button', { name: '기록 삭제' }));
      const dialog = await screen.findByRole('alertdialog', { name: '기록을 삭제할까요?' });
      expect(mock.queries.some(query => query.operation === 'delete')).toBe(false);
      fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
      await screen.findByText('아직 기록이 없어요. 첫 뽀모도로를 시작하면 여기에 쌓여요.');
      expect(mock.queries.find(query => query.operation === 'delete')).toMatchObject({
        filters: [['user_id', 'user-a']], batchFilter: 'session_batch_id.eq.batch-2,group_id.eq.batch-2',
      });
    });

    it('삭제 확인을 취소하면 아무것도 지우지 않는다', async () => {
      render(<HistoryList session={session('user-a')} />);
      fireEvent.click(await recordButton(/블록체인 9\/12 복습/));
      fireEvent.click(screen.getByRole('button', { name: '기록 삭제' }));
      fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '취소' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(mock.queries.some(query => query.operation === 'delete')).toBe(false);
      expect(screen.getByRole('textbox', { name: '작업 메모' })).toBeInTheDocument();
    });

    it('모바일에서는 기록 수정 대화상자로 편집하고 Escape로 닫는다', async () => {
      setDesktop(false);
      render(<HistoryList session={session('user-a')} />);
      const rowButton = await recordButton(/블록체인 9\/12 복습/);
      expect(rowButton).toHaveAttribute('aria-haspopup', 'dialog');
      fireEvent.click(rowButton);
      const dialog = await screen.findByRole('dialog', { name: '기록 수정' });
      const input = within(dialog).getByRole('textbox', { name: '작업 메모' });
      await waitFor(() => expect(input).toHaveFocus());
      expect(within(dialog).getByRole('combobox', { name: '과목' })).toHaveTextContent('블록체인');
      expect(within(dialog).getByRole('button', { name: '이 기록 삭제' })).toBeInTheDocument();
      fireEvent.keyDown(input, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(rowButton).toHaveFocus();
    });
  });

  describe('긴 과목 이름', () => {
    // 과목 이름은 1~80자까지 저장된다(lib/studySubjects). 줄이지 않으면 메모를 밀어내고 길이와 겹친다.
    const longSubject = '컴퓨터과학알고리즘자료구조네트워크운영체제데이터베이스'.repeat(3).slice(0, 80);

    it('과목은 메모·과목 영역의 일부까지만 쓰고 말줄임하며 메모와 길이는 그대로 둔다', async () => {
      mock.subjects = [{ id: 'long', name: longSubject }];
      mock.rows = [row({ subject_id: 'long', task: '합의 알고리즘 복습' })];
      render(<HistoryList session={session('user-a')} />);
      const memo = await screen.findByText('합의 알고리즘 복습');
      const subject = screen.getByTitle(longSubject);
      expect(subject).toHaveTextContent(longSubject);
      expect(subject).toHaveClass('min-w-0', 'max-w-[40%]', 'shrink-0', 'truncate');
      expect(memo).toHaveClass('min-w-0', 'truncate');
      expect(memo).not.toHaveClass('shrink-0');
      // 메모와 과목은 같은 영역에 있고, 길이는 그 영역 밖(행 버튼의 바로 아래 자식)에 남는다.
      const region = subject.parentElement!;
      expect(region).toContainElement(memo);
      expect(region).toHaveClass('min-w-0');
      const duration = screen.getByText('2분');
      expect(region).not.toContainElement(duration);
      expect(duration).toHaveClass('shrink-0');
      const rowButton = screen.getByRole('button', { name: /합의 알고리즘 복습/ });
      expect(duration.parentElement).toBe(rowButton);
      // 모바일 보드의 두 줄 행 높이(최소 50px + 위아래 5px = 60px), 데스크톱 52px
      expect(rowButton).toHaveClass('min-h-[60px]', 'md:min-h-[52px]');
    });
  });

  describe('계정 전환과 로그아웃', () => {
    it('계정을 바꾸면 이전 계정의 늦은 조회 응답을 무시한다', async () => {
      const pending = deferred<Result>();
      mock.listResults.push(pending.promise);
      const { rerender } = render(<HistoryList session={session('user-a')} />);
      await waitFor(() => expect(readQueries()).toHaveLength(1));
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
      const pending = deferred<Result>();
      mock.mutationResults.push(pending.promise);
      const { rerender } = render(<HistoryList session={session('user-a')} />);
      fireEvent.click(await recordButton(/블록체인 9\/12 복습/));
      if (operation === 'update') {
        fireEvent.change(screen.getByRole('textbox', { name: '작업 메모' }), { target: { value: '이전 계정 수정' } });
        fireEvent.click(screen.getByRole('button', { name: '저장' }));
      } else {
        fireEvent.click(screen.getByRole('button', { name: '기록 삭제' }));
        fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '삭제' }));
      }
      await waitFor(() => expect(mock.queries.some(query => query.operation === operation)).toBe(true));
      mock.getUser.mockResolvedValue({ data: { user: { id: 'user-b' } } });
      mock.rows = [row({ user_id: 'user-b', task: '새 계정 메모' })];
      rerender(<HistoryList session={session('user-b')} />);
      fireEvent.click(await recordButton(/새 계정 메모/));
      fireEvent.change(screen.getByRole('textbox', { name: '작업 메모' }), { target: { value: '새 계정 작성 중' } });
      await act(async () => pending.resolve({ data: null, error: outcome === '실패' ? new Error('permission denied') : null }));
      expect(screen.getByRole('textbox', { name: '작업 메모' })).toHaveValue('새 계정 작성 중');
      expect(mock.success).not.toHaveBeenCalled();
      expect(mock.error).not.toHaveBeenCalled();
      expect(mock.notify).not.toHaveBeenCalled();
    });

    it('로그아웃 후 늦은 조회 오류는 표시하지 않는다', async () => {
      const pending = deferred<Result>();
      mock.listResults.push(pending.promise);
      const { rerender } = render(<HistoryList session={session('user-a')} />);
      await waitFor(() => expect(readQueries()).toHaveLength(1));
      rerender(<HistoryList session={null} />);
      expect(screen.getByRole('button', { name: '로그인하기' })).toBeInTheDocument();
      await act(async () => pending.resolve({ data: null, error: new Error('permission denied') }));
      expect(mock.error).not.toHaveBeenCalled();
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });

    it('로그아웃 상태에서는 로그인 안내만 보이고 로그인 창을 연다', () => {
      const onOpenLogin = vi.fn();
      render(<HistoryList session={null} onOpenLogin={onOpenLogin} />);
      fireEvent.click(screen.getByRole('button', { name: '로그인하기' }));
      expect(onOpenLogin).toHaveBeenCalledOnce();
      expect(screen.queryByRole('region', { name: '최근 7일' })).not.toBeInTheDocument();
      expect(mock.from).not.toHaveBeenCalled();
    });
  });

  describe('접기와 오늘·최근 7일 요약', () => {
    it('onToggleCollapsed가 없으면 머리 줄과 접기 버튼 없이 펼쳐 그린다', async () => {
      render(<HistoryList session={session('user-a')} />);
      await recordButton(/블록체인 9\/12 복습/);
      expect(screen.queryByRole('button', { name: /접기|펼치기/ })).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: '최근 활동 목록' }).closest('[inert]')).toBeNull();
    });

    it('머리 줄의 접기 버튼이 본문을 가리키고 상태를 알린다', async () => {
      const onToggle = vi.fn();
      const { rerender } = render(<HistoryList session={session('user-a')} collapsed={false} onToggleCollapsed={onToggle} />);
      await recordButton(/블록체인 9\/12 복습/);
      const toggle = screen.getByRole('button', { name: /최근 활동.*접기/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      // 모바일 터치 영역 44px 이상, 데스크톱은 보드의 56px
      expect(toggle).toHaveClass('min-h-11', 'md:min-h-14');
      const body = document.getElementById(toggle.getAttribute('aria-controls')!);
      expect(body).toContainElement(screen.getByRole('region', { name: '최근 활동 목록' }));
      expect(body).not.toHaveAttribute('inert');
      fireEvent.click(toggle);
      expect(onToggle).toHaveBeenCalledOnce();

      rerender(<HistoryList session={session('user-a')} collapsed onToggleCollapsed={onToggle} />);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveTextContent('펼치기');
      expect(body).toHaveAttribute('inert');
    });

    it('오늘 요약과 최근 7일 구슬을 같은 기록에서 센다', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 28, 21, 40));
      mock.rows = [
        // 오늘: 분할 저장된 뽀모도로 1개(조각 2개) + 뽀모도로 1개 + 스톱워치 15분
        row({ id: 1, duration: 600, created_at: new Date(2026, 9, 28, 9, 0).toISOString(), session_batch_id: 'b1' }),
        row({ id: 2, duration: 900, created_at: new Date(2026, 9, 28, 9, 15).toISOString(), session_batch_id: 'b1' }),
        row({ id: 3, duration: 1500, created_at: new Date(2026, 9, 28, 21, 5).toISOString() }),
        row({ id: 4, mode: 'stopwatch', duration: 900, created_at: new Date(2026, 9, 28, 14, 0).toISOString() }),
        // 어제(새벽 2시는 05:00 경계상 그제 공부일) · 2일 전 · 7일 넘은 기록
        row({ id: 5, duration: 1500, created_at: new Date(2026, 9, 27, 20, 30).toISOString() }),
        row({ id: 6, duration: 1500, created_at: new Date(2026, 9, 27, 2, 0).toISOString() }),
        row({ id: 7, duration: 1500, created_at: new Date(2026, 9, 20, 10, 0).toISOString() }),
      ];
      render(<HistoryList session={session('user-a')} collapsed={false} onToggleCollapsed={vi.fn()} />);
      expect(await screen.findByText('오늘 1시간 5분 집중, 뽀모도로 2개')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: '최근 7일 뽀모도로: 목 0개, 금 0개, 토 0개, 일 0개, 월 1개, 화 1개, 수 2개' })).toBeInTheDocument();
      expect(screen.getAllByText('뽀모도로 4개').length).toBeGreaterThan(0);
      const recent = mock.queries.find(query => query.range);
      expect(recent?.since).toBe(new Date(2026, 9, 21, 5, 0).toISOString());
      expect(recent?.filters).toEqual([['user_id', 'user-a']]);
      // 시각 표기: 오늘은 시:분, 어제는 "어제", 그 전은 월/일
      expect(screen.getAllByText('21:05').length).toBeGreaterThan(0);
      expect(screen.getAllByText('어제 20:30').length).toBeGreaterThan(0);
      expect(screen.getAllByText('어제 2:00').length).toBeGreaterThan(0);
      expect(screen.getAllByText('10/20 10:00').length).toBeGreaterThan(0);
    });

    it('기록이 없으면 빈 안내와 0개짜리 7일 요약을 보여 준다', async () => {
      mock.rows = [];
      render(<HistoryList session={session('user-a')} collapsed={false} onToggleCollapsed={vi.fn()} />);
      expect(await screen.findByText('아직 기록이 없어요. 첫 뽀모도로를 시작하면 여기에 쌓여요.')).toBeInTheDocument();
      expect(screen.getByText('오늘 0분 집중, 뽀모도로 0개')).toBeInTheDocument();
      expect(screen.getAllByText('뽀모도로 0개').length).toBeGreaterThan(0);
    });

    it('접기는 공통 ui-collapse로 움직이고 접히는 순간부터 본문은 inert다', async () => {
      const { rerender } = render(<HistoryList session={session('user-a')} collapsed={false} onToggleCollapsed={vi.fn()} />);
      await recordButton(/블록체인 9\/12 복습/);
      const toggle = screen.getByRole('button', { name: /최근 활동.*접기/ });
      const body = document.getElementById(toggle.getAttribute('aria-controls')!)!;
      expect(body).toHaveClass('ui-collapse');
      expect(body).toHaveAttribute('data-state', 'open');
      rerender(<HistoryList session={session('user-a')} collapsed onToggleCollapsed={vi.fn()} />);
      expect(body).toHaveAttribute('data-state', 'closed');
      expect(body).toHaveAttribute('inert');
    });

    describe('새 기록 행', () => {
      const listItem = (name: RegExp) => screen.getByRole('button', { name }).closest('li')!;
      const risingRows = () => Array.from(document.querySelectorAll('li.animate-fade-up'));

      it('저장 뒤 다시 불러온 목록에서 새로 생긴 행만 한 번 떠오른다', async () => {
        const props = { session: session('user-a'), collapsed: false, onToggleCollapsed: vi.fn() };
        const { rerender } = render(<HistoryList {...props} updateTrigger={0} />);
        await recordButton(/블록체인 9\/12 복습/);
        // 처음 불러온 목록은 움직이지 않는다.
        expect(risingRows()).toHaveLength(0);

        mock.rows = [row({ id: 9, task: '새로 저장한 기록', created_at: '2026-09-20T13:00:00Z' }), row()];
        rerender(<HistoryList {...props} updateTrigger={1} />);
        await recordButton(/새로 저장한 기록/);
        expect(risingRows()).toEqual([listItem(/새로 저장한 기록/)]);

        // 새로고침(사용자 저장이 아닌 다시 불러오기)은 표시를 지우고 아무 행도 움직이지 않는다.
        fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
        await waitFor(() => expect(readQueries()).toHaveLength(3));
        await waitFor(() => expect(risingRows()).toHaveLength(0));
      });

      it('접힌 시트에서는 펼칠 때 한 번 떠오르고, 다시 접었다 펼치면 반복하지 않는다', async () => {
        const onToggleCollapsed = vi.fn();
        const { rerender } = render(<HistoryList session={session('user-a')} collapsed onToggleCollapsed={onToggleCollapsed} updateTrigger={0} />);
        await recordButton(/블록체인 9\/12 복습/);
        mock.rows = [row({ id: 9, task: '새로 저장한 기록', created_at: '2026-09-20T13:00:00Z' }), row()];
        rerender(<HistoryList session={session('user-a')} collapsed onToggleCollapsed={onToggleCollapsed} updateTrigger={1} />);
        await waitFor(() => expect(readQueries()).toHaveLength(2));
        await screen.findByText('새로 저장한 기록');
        expect(risingRows()).toHaveLength(0);

        rerender(<HistoryList session={session('user-a')} collapsed={false} onToggleCollapsed={onToggleCollapsed} updateTrigger={1} />);
        expect(risingRows()).toEqual([listItem(/새로 저장한 기록/)]);

        rerender(<HistoryList session={session('user-a')} collapsed onToggleCollapsed={onToggleCollapsed} updateTrigger={1} />);
        rerender(<HistoryList session={session('user-a')} collapsed={false} onToggleCollapsed={onToggleCollapsed} updateTrigger={1} />);
        expect(risingRows()).toHaveLength(0);
      });

      it('펼친 인라인 편집기는 행 아래에서 떠오른다', async () => {
        render(<HistoryList session={session('user-a')} />);
        fireEvent.click(await recordButton(/블록체인 9\/12 복습/));
        expect(screen.getByRole('textbox', { name: '작업 메모' }).closest('form')).toHaveClass('animate-fade-up');
      });
    });

    it('updateTrigger와 새로고침 버튼으로 다시 불러온다', async () => {
      const { rerender } = render(<HistoryList session={session('user-a')} updateTrigger={0} />);
      await recordButton(/블록체인 9\/12 복습/);
      expect(readQueries()).toHaveLength(1);
      mock.rows = [row({ id: 9, task: '새로 저장한 기록' }), row()];
      rerender(<HistoryList session={session('user-a')} updateTrigger={1} />);
      await recordButton(/새로 저장한 기록/);
      expect(readQueries()).toHaveLength(2);
      fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
      await waitFor(() => expect(readQueries()).toHaveLength(3));
    });
  });
});
