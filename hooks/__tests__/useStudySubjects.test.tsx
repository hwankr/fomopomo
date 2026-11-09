import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  rows: [] as { id: string; user_id: string; name: string }[],
  calls: [] as { action: string; owner: unknown; payload: Record<string, unknown> }[],
  pendingRead: null as null | ((value: unknown) => void),
  deferNextRead: false,
  failure: null as { code: string } | null,
  rpc: vi.fn(),
  // 저장된 로그인 세션의 사용자(null = 알 수 없음/로그아웃)
  signedInAs: null as string | null,
}));

vi.mock('@/lib/userScopedStorage', () => ({ getCurrentUserId: () => db.signedInAs }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => db.rpc(...args),
    from: () => {
      let action = 'select';
      let payload: Record<string, unknown> = {};
      const filters: Record<string, unknown> = {};
      let offset = 0;
      const query = {
        select: () => query,
        order: () => query,
        range: (from: number) => { offset = from; return query; },
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        insert: (value: Record<string, unknown>) => { action = 'insert'; payload = value; return query; },
        update: (value: Record<string, unknown>) => { action = 'update'; payload = value; return query; },
        single: () => query,
        then: (resolve: (value: unknown) => unknown) => {
          db.calls.push({ action, owner: filters.user_id, payload });
          if (action === 'select' && db.deferNextRead) {
            db.deferNextRead = false;
            return new Promise(result => { db.pendingRead = result; }).then(resolve);
          }
          if (db.failure && action !== 'select') return Promise.resolve({ data: null, error: db.failure }).then(resolve);
          if (action === 'insert') {
            const row = { id: `subject-${db.rows.length}`, user_id: String(payload.user_id), name: String(payload.name) };
            db.rows.push(row);
            return Promise.resolve({ data: row, error: null }).then(resolve);
          }
          const matching = db.rows.filter(row => Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value));
          if (action === 'update') {
            matching.forEach(row => { row.name = String(payload.name); });
            return Promise.resolve({ data: matching[0] ?? null, error: null }).then(resolve);
          }
          return Promise.resolve({ data: matching.slice(offset, offset + 1), error: null }).then(resolve);
        },
      };
      return query;
    },
  },
}));

import { useStudySubjects } from '@/hooks/useStudySubjects';
import { notifyStudySubjectsChanged, STUDY_SUBJECTS_CHANGED_EVENT } from '@/lib/studySubjects';

const changed = vi.fn();
beforeEach(() => {
  db.rows = [
    { id: 'a', user_id: 'alice', name: '블록체인' },
    { id: 'b', user_id: 'alice', name: '코딩테스트' },
    { id: 'c', user_id: 'bob', name: '수학' },
  ];
  db.calls = [];
  db.pendingRead = null;
  db.deferNextRead = false;
  db.failure = null;
  db.signedInAs = null;
  db.rpc.mockReset();
  changed.mockReset();
  window.addEventListener(STUDY_SUBJECTS_CHANGED_EVENT, changed);
});
afterEach(() => {
  window.removeEventListener(STUDY_SUBJECTS_CHANGED_EVENT, changed);
  cleanup();
});

async function loaded(owner = 'alice') {
  const view = renderHook(({ user }: { user: string | null }) => useStudySubjects(user), { initialProps: { user: owner as string | null } });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}
const ids = (subjects: { id: string }[]) => subjects.map(subject => subject.id);

describe('useStudySubjects', () => {
  it('loads every page and only the signed-in owner subjects', async () => {
    const { result } = renderHook(() => useStudySubjects('alice'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.subjects.map(subject => subject.id)).toEqual(['a', 'b']);
    expect(db.calls).toHaveLength(3);
    expect(db.calls.every(call => call.owner === 'alice')).toBe(true);
  });

  it('immediately hides an old account and ignores its late response', async () => {
    db.deferNextRead = true;
    const { result, rerender } = renderHook(({ owner }) => useStudySubjects(owner), { initialProps: { owner: 'alice' } });
    await waitFor(() => expect(db.pendingRead).not.toBeNull());
    rerender({ owner: 'bob' });
    expect(result.current.subjects).toEqual([]);
    await waitFor(() => expect(result.current.subjects.map(subject => subject.id)).toEqual(['c']));
    await act(async () => { db.pendingRead?.({ data: [db.rows[0]], error: null }); });
    expect(result.current.subjects.map(subject => subject.id)).toEqual(['c']);
  });

  it('creates trimmed names and refreshes all mounted selectors', async () => {
    const first = renderHook(() => useStudySubjects('alice'));
    const second = renderHook(() => useStudySubjects('alice'));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    await act(async () => { await first.result.current.createSubject('  데이터베이스  '); });
    await waitFor(() => expect(second.result.current.subjects.map(subject => subject.name)).toContain('데이터베이스'));
    expect(db.calls.find(call => call.action === 'insert')?.payload).toEqual({ user_id: 'alice', name: '데이터베이스' });
  });

  it('renames the same ID and surfaces duplicate-name failures', async () => {
    const { result } = renderHook(() => useStudySubjects('alice'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { expect(await result.current.renameSubject('a', '블록체인 이론')).toBe(true); });
    await waitFor(() => expect(result.current.subjects.find(subject => subject.id === 'a')?.name).toBe('블록체인 이론'));
    db.failure = { code: '23505' };
    await act(async () => { expect(await result.current.createSubject('코딩테스트')).toBeNull(); });
    expect(result.current.error).toContain('이미');
  });

  it('refreshes external changes and never queries or mutates when signed out', async () => {
    const { result, rerender } = renderHook(({ owner }: { owner: string | null }) => useStudySubjects(owner), { initialProps: { owner: 'alice' as string | null } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    db.rows[0].name = '변경된 과목';
    act(() => notifyStudySubjectsChanged());
    await waitFor(() => expect(result.current.subjects[0].name).toBe('변경된 과목'));
    rerender({ owner: null });
    expect(result.current.subjects).toEqual([]);
    const count = db.calls.length;
    await act(async () => { expect(await result.current.createSubject('수학')).toBeNull(); });
    expect(db.calls).toHaveLength(count);
  });
});

describe('useStudySubjects deleteSubject', () => {
  it('deletes through the RPC, drops the row at once and tells other screens to reload', async () => {
    db.rpc.mockImplementation(async () => {
      db.rows = db.rows.filter(row => row.id !== 'a');
      return { data: { status: 'deleted', unassigned: { tasks: 2, weekly_plans: 0, monthly_plans: 0, pinned_tasks: 0, long_term_tasks: 1, study_sessions: 5 } }, error: null };
    });
    const { result } = await loaded();
    // Hold the reload that the change event starts, so the list seen here is the hook's own update.
    db.deferNextRead = true;
    let outcome: unknown;
    await act(async () => { outcome = await result.current.deleteSubject('a'); });
    expect(outcome).toEqual({ status: 'deleted' });
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith('delete_study_subject', { p_subject_id: 'a' });
    expect(ids(result.current.subjects)).toEqual(['b']);
    expect(result.current.error).toBeNull();
    expect(changed).toHaveBeenCalledTimes(1);
    // The reload it started reads the server list (the subject is gone there too).
    expect(db.pendingRead).not.toBeNull();
    await act(async () => { db.pendingRead?.({ data: [db.rows[0]], error: null }); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ids(result.current.subjects)).toEqual(['b']);
  });

  it('treats not_found (already deleted elsewhere) as deleted', async () => {
    db.rpc.mockResolvedValue({ data: { status: 'not_found' }, error: null });
    const { result } = await loaded();
    db.deferNextRead = true;
    let outcome: unknown;
    await act(async () => { outcome = await result.current.deleteSubject('b'); });
    expect(outcome).toEqual({ status: 'deleted' });
    expect(ids(result.current.subjects)).toEqual(['a']);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('returns the subject group projects as strings only and leaves the list and error alone', async () => {
    db.rpc.mockResolvedValue({ data: { status: 'in_use_by_subject_group', projects: ['중간고사', 3, null, '기말고사', { title: 'x' }] }, error: null });
    const { result } = await loaded();
    let outcome: unknown;
    await act(async () => { outcome = await result.current.deleteSubject('a'); });
    expect(outcome).toEqual({ status: 'in_use_by_subject_group', projects: ['중간고사', '기말고사'] });
    expect(ids(result.current.subjects)).toEqual(['a', 'b']);
    expect(result.current.error).toBeNull();
    expect(changed).not.toHaveBeenCalled();

    db.rpc.mockResolvedValue({ data: { status: 'in_use_by_subject_group' }, error: null });
    await act(async () => { outcome = await result.current.deleteSubject('a'); });
    expect(outcome).toEqual({ status: 'in_use_by_subject_group', projects: [] });
  });

  it.each([
    ['an RPC error (missing function before the migration)', () => db.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })],
    ['a permission error', () => db.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Authentication required' } })],
    ['a thrown exception', () => db.rpc.mockRejectedValue(new Error('offline'))],
    ['an empty response', () => db.rpc.mockResolvedValue({ data: null, error: null })],
    ['a string response', () => db.rpc.mockResolvedValue({ data: 'deleted', error: null })],
    ['an array response', () => db.rpc.mockResolvedValue({ data: [{ status: 'deleted' }], error: null })],
    ['an unknown status', () => db.rpc.mockResolvedValue({ data: { status: 'archived' }, error: null })],
  ])('fails on %s without touching the list or the shared load error', async (_label, arrange) => {
    arrange();
    const { result } = await loaded();
    let outcome: unknown;
    await act(async () => { outcome = await result.current.deleteSubject('a'); });
    expect(outcome).toEqual({ status: 'failed' });
    expect(ids(result.current.subjects)).toEqual(['a', 'b']);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });

  it('ignores a late response after the account changes and never calls the RPC when signed out', async () => {
    let respond!: (value: unknown) => void;
    db.rpc.mockImplementationOnce(() => new Promise(done => { respond = done; }));
    const { result, rerender } = await loaded();
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.deleteSubject('a'); });
    rerender({ user: 'bob' });
    await waitFor(() => expect(ids(result.current.subjects)).toEqual(['c']));
    let outcome: unknown;
    await act(async () => {
      respond({ data: { status: 'deleted' }, error: null });
      outcome = await pending;
    });
    expect(outcome).toEqual({ status: 'failed' });
    expect(ids(result.current.subjects)).toEqual(['c']);
    expect(changed).not.toHaveBeenCalled();

    rerender({ user: null });
    await act(async () => { outcome = await result.current.deleteSubject('c'); });
    expect(outcome).toEqual({ status: 'failed' });
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  // 같은 계정에서 훅만 언마운트된 뒤(예: 확인 직후 과목 관리 패널을 접음) 온 응답
  async function deleteThenUnmount(signedInAs: string | null) {
    let respond!: (value: unknown) => void;
    db.rpc.mockImplementationOnce(() => new Promise(done => { respond = done; }));
    db.signedInAs = signedInAs;
    const view = await loaded();
    let pending!: Promise<unknown>;
    act(() => { pending = view.result.current.deleteSubject('a'); });
    view.unmount();
    const settle = async (response: unknown) => {
      let outcome: unknown;
      await act(async () => { respond(response); outcome = await pending; });
      return outcome;
    };
    return settle;
  }

  it.each([
    ['deleted', null],
    ['not_found', null],
    ['deleted', 'alice'],
  ])('still announces a confirmed deletion (%s, signed in as %s) after unmount without touching its state', async (status, signedInAs) => {
    const settle = await deleteThenUnmount(signedInAs);
    const consoleError = vi.spyOn(console, 'error');
    expect(await settle({ data: { status }, error: null })).toEqual({ status: 'deleted' });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each([
    ['an RPC error', { data: null, error: { code: 'PGRST202' } }, { status: 'failed' }],
    ['an unknown response', { data: { status: 'archived' }, error: null }, { status: 'failed' }],
    ['a subject group refusal', { data: { status: 'in_use_by_subject_group', projects: ['중간고사'] }, error: null }, { status: 'in_use_by_subject_group', projects: ['중간고사'] }],
  ])('sends no change event when the late response after unmount is %s', async (_label, response, expected) => {
    const settle = await deleteThenUnmount(null);
    expect(await settle(response)).toEqual(expected);
    expect(changed).not.toHaveBeenCalled();
  });

  it('treats a late response after unmount as stale when another account is now signed in', async () => {
    const settle = await deleteThenUnmount('alice');
    // 사용자 키로 다시 그려지는 관리 화면은 계정을 바꾸면 언마운트된다. 그 사이 저장된 세션이 bob으로 바뀌었다.
    db.signedInAs = 'bob';
    expect(await settle({ data: { status: 'deleted' }, error: null })).toEqual({ status: 'failed' });
    expect(changed).not.toHaveBeenCalled();
  });
});
