import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  rows: [] as { id: string; user_id: string; name: string; archived_at?: string | null }[],
  calls: [] as { action: string; owner: unknown; payload: Record<string, unknown>; columns?: string; id?: unknown; filters: Record<string, unknown> }[],
  pendingRead: null as null | ((value: unknown) => void),
  deferNextRead: false,
  // 모든 읽기를 붙잡아 둔다(느린 연결에서 변경 이벤트가 시작한 다시 읽기가 아직 오지 않은 상태).
  holdReads: false,
  // 다음 추가·이름 변경·보관 요청의 응답을 잡아 두고, 테스트가 정한 응답으로 끝낸다.
  pendingWrite: null as null | ((value: unknown) => void),
  deferNextWrite: false,
  failure: null as { code: string } | null,
  // 읽기 오류(보관 열과 관계없는 오류)
  readFailure: null as { code: string } | null,
  // 앱이 DB보다 먼저 배포된 상태: archived_at 열이 아직 없다.
  missingArchiveColumn: false,
  throwNextWrite: false,
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
      let columns: string | undefined;
      const filters: Record<string, unknown> = {};
      let offset = 0;
      const query = {
        select: (value?: string) => { columns = value; return query; },
        order: () => query,
        range: (from: number) => { offset = from; return query; },
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        insert: (value: Record<string, unknown>) => { action = 'insert'; payload = value; return query; },
        update: (value: Record<string, unknown>) => { action = 'update'; payload = value; return query; },
        single: () => query,
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
          db.calls.push({ action, owner: filters.user_id, payload, columns, id: filters.id, filters: { ...filters } });
          if (action === 'select' && db.holdReads) return new Promise(() => {});
          if (action === 'select' && db.deferNextRead) {
            db.deferNextRead = false;
            return new Promise(result => { db.pendingRead = result; }).then(resolve);
          }
          if (action !== 'select' && db.deferNextWrite) {
            db.deferNextWrite = false;
            return new Promise(result => { db.pendingWrite = result; }).then(resolve);
          }
          if (action !== 'select' && db.throwNextWrite) {
            db.throwNextWrite = false;
            return Promise.reject(new Error('offline')).then(resolve, reject);
          }
          if (db.failure && action !== 'select') return Promise.resolve({ data: null, error: db.failure }).then(resolve);
          if (action === 'select' && db.readFailure) return Promise.resolve({ data: null, error: db.readFailure }).then(resolve);
          if (db.missingArchiveColumn && (columns?.includes('archived_at') || 'archived_at' in payload)) {
            // PostgREST: select한 열이 없으면 42703, 바꾸려는 열이 없으면 PGRST204
            const error = action === 'select'
              ? { code: '42703', message: 'column study_subjects.archived_at does not exist' }
              : { code: 'PGRST204', message: "Could not find the 'archived_at' column of 'study_subjects' in the schema cache" };
            return Promise.resolve({ data: null, error }).then(resolve);
          }
          if (action === 'insert') {
            // DB 유일 인덱스 lower(btrim(name))처럼 같은 계정의 같은 이름(보관한 과목 포함)은 23505다.
            const nameKey = (name: unknown) => String(name).trim().toLocaleLowerCase();
            if (db.rows.some(row => row.user_id === payload.user_id && nameKey(row.name) === nameKey(payload.name))) {
              return Promise.resolve({ data: null, error: { code: '23505' } }).then(resolve);
            }
            const row = { id: `subject-${db.rows.length}`, user_id: String(payload.user_id), name: String(payload.name) };
            db.rows.push(row);
            // 응답은 복사본이다(훅이 가진 행이 서버 행과 같은 객체여서 우연히 최신이 되지 않게).
            return Promise.resolve({ data: { ...row }, error: null }).then(resolve);
          }
          const matching = db.rows.filter(row => Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value));
          if (action === 'update') {
            matching.forEach(row => { Object.assign(row, payload); });
            // .single(): 바뀐 행이 없으면 PGRST116
            if (!matching[0]) return Promise.resolve({ data: null, error: { code: 'PGRST116' } }).then(resolve);
            return Promise.resolve({ data: { ...matching[0] }, error: null }).then(resolve);
          }
          // 보관 열이 없을 때의 읽기처럼 select에 없는 열은 돌려주지 않는다.
          const page = matching.slice(offset, offset + 1).map(row => columns?.includes('archived_at')
            ? { ...row, archived_at: row.archived_at ?? null }
            : { id: row.id, user_id: row.user_id, name: row.name });
          return Promise.resolve({ data: page, error: null }).then(resolve);
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
  db.holdReads = false;
  db.pendingWrite = null;
  db.deferNextWrite = false;
  db.failure = null;
  db.readFailure = null;
  db.missingArchiveColumn = false;
  db.throwNextWrite = false;
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

describe('useStudySubjects archive', () => {
  const ARCHIVED_AT = '2026-11-01T09:00:00.000Z';
  const selects = () => db.calls.filter(call => call.action === 'select');
  const updates = () => db.calls.filter(call => call.action === 'update');

  it('selects archived_at and keeps archived subjects in the list in name order', async () => {
    db.rows[0].archived_at = ARCHIVED_AT;
    const { result } = await loaded();
    expect(selects().length).toBeGreaterThan(0);
    expect(selects().every(call => call.columns?.split(',').map(column => column.trim()).includes('archived_at'))).toBe(true);
    expect(result.current.subjects.map(({ id, archived_at }) => ({ id, archived_at }))).toEqual([
      { id: 'a', archived_at: ARCHIVED_AT },
      { id: 'b', archived_at: null },
    ]);
    expect(result.current.error).toBeNull();
  });

  it('reads the same page again without archived_at before the column exists and treats every subject as in use', async () => {
    db.missingArchiveColumn = true;
    const { result } = await loaded();
    expect(ids(result.current.subjects)).toEqual(['a', 'b']);
    expect(result.current.subjects.every(subject => !subject.archived_at)).toBe(true);
    expect(result.current.error).toBeNull();
    // 첫 페이지만 열 없이 다시 읽고, 그 뒤 페이지는 처음부터 열 없이 읽는다.
    expect(selects().map(call => call.columns?.includes('archived_at'))).toEqual([true, false, false, false]);

    // 그 상태의 보관 요청은 실패로 끝나고 공용 오류에는 들어가지 않는다.
    let outcome: unknown;
    await act(async () => { outcome = await result.current.archiveSubject('a'); });
    expect(outcome).toBe(false);
    expect(result.current.error).toBeNull();
    expect(changed).not.toHaveBeenCalled();
  });

  it('still reports other read errors as a load error', async () => {
    db.readFailure = { code: '42501' };
    const { result } = await loaded();
    expect(result.current.error).toBe('과목을 불러오지 못했습니다. 다시 시도해주세요.');
    // 열이 없을 때만 다시 읽는다.
    expect(selects()).toHaveLength(1);
  });

  it('archives and restores only that subject, keeping its ID and name, and announces each change once', async () => {
    const { result } = await loaded();
    // Hold the reload that the change event starts, so the list seen here is the hook's own update.
    db.deferNextRead = true;
    let outcome: unknown;
    await act(async () => { outcome = await result.current.archiveSubject('a'); });
    expect(outcome).toBe(true);
    const archived = updates()[0];
    expect(archived).toMatchObject({ owner: 'alice', id: 'a', columns: 'id, archived_at' });
    expect(Object.keys(archived.payload)).toEqual(['archived_at']);
    expect(new Date(String(archived.payload.archived_at)).toISOString()).toBe(archived.payload.archived_at);
    expect(result.current.subjects).toEqual([
      { id: 'a', user_id: 'alice', name: '블록체인', archived_at: archived.payload.archived_at },
      { id: 'b', user_id: 'alice', name: '코딩테스트', archived_at: null },
    ]);
    expect(result.current.error).toBeNull();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(db.pendingRead).not.toBeNull();
    await act(async () => { db.pendingRead?.({ data: db.rows.filter(row => row.user_id === 'alice').slice(0, 1), error: null }); });
    await waitFor(() => expect(result.current.loading).toBe(false));

    db.deferNextRead = true;
    await act(async () => { outcome = await result.current.restoreSubject('a'); });
    expect(outcome).toBe(true);
    expect(updates()[1]).toMatchObject({ owner: 'alice', id: 'a', payload: { archived_at: null } });
    expect(result.current.subjects.find(subject => subject.id === 'a')).toEqual({ id: 'a', user_id: 'alice', name: '블록체인', archived_at: null });
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a permission error', () => { db.failure = { code: '42501' }; }],
    ['a missing column (before the migration)', () => { db.missingArchiveColumn = true; }],
    ['a thrown exception', () => { db.throwNextWrite = true; }],
  ])('fails on %s without touching the list or the shared load error', async (_label, arrange) => {
    const { result } = await loaded();
    for (const send of [() => result.current.archiveSubject('a'), () => result.current.restoreSubject('a')]) {
      arrange();
      let outcome: unknown;
      await act(async () => { outcome = await send(); });
      expect(outcome).toBe(false);
    }
    expect(ids(result.current.subjects)).toEqual(['a', 'b']);
    expect(result.current.subjects.every(subject => !subject.archived_at)).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });

  it('fails on 0 rows (deleted elsewhere) and reloads the list without a load error', async () => {
    const { result } = await loaded();
    // 다른 기기에서 지웠다.
    db.rows = db.rows.filter(row => row.id !== 'a');
    const before = selects().length;
    let outcome: unknown;
    await act(async () => { outcome = await result.current.archiveSubject('a'); });
    expect(outcome).toBe(false);
    expect(changed).not.toHaveBeenCalled();
    await waitFor(() => expect(ids(result.current.subjects)).toEqual(['b']));
    expect(selects().length).toBeGreaterThan(before);
    expect(result.current.error).toBeNull();
  });

  it('never sends a request when signed out', async () => {
    const { result, rerender } = await loaded();
    rerender({ user: null });
    const count = db.calls.length;
    let outcome: unknown;
    await act(async () => { outcome = await result.current.archiveSubject('a'); });
    expect(outcome).toBe(false);
    await act(async () => { outcome = await result.current.restoreSubject('a'); });
    expect(outcome).toBe(false);
    expect(db.calls).toHaveLength(count);
  });
});

describe('useStudySubjects createSubject with an archived subject of the same name', () => {
  beforeEach(() => {
    db.rows = [
      { id: 'sql', user_id: 'alice', name: 'SQL', archived_at: '2026-11-01T09:00:00.000Z' },
      { id: 'b', user_id: 'alice', name: '코딩테스트', archived_at: null },
      // 다른 계정의 같은 이름은 상관없다.
      { id: 'bob-sql', user_id: 'bob', name: 'sql', archived_at: '2026-11-01T09:00:00.000Z' },
    ];
  });

  it.each(['SQL', ' sql ', 'Sql'])('restores it instead of inserting for %j (case and outer spaces ignored)', async name => {
    const { result } = await loaded();
    db.deferNextRead = true;
    let created: unknown;
    await act(async () => { created = await result.current.createSubject(name); });
    expect(created).toEqual({ id: 'sql', user_id: 'alice', name: 'SQL', archived_at: null });
    expect(db.calls.some(call => call.action === 'insert')).toBe(false);
    expect(db.calls.filter(call => call.action === 'update')).toEqual([
      expect.objectContaining({ owner: 'alice', id: 'sql', payload: { archived_at: null } }),
    ]);
    expect(result.current.subjects.find(subject => subject.id === 'sql')?.archived_at).toBeNull();
    expect(result.current.subjects).toHaveLength(2);
    expect(result.current.error).toBeNull();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('returns null without inserting when the restore fails', async () => {
    const { result } = await loaded();
    db.failure = { code: '42501' };
    let created: unknown;
    await act(async () => { created = await result.current.createSubject('sql'); });
    expect(created).toBeNull();
    expect(db.calls.some(call => call.action === 'insert')).toBe(false);
    expect(result.current.subjects.find(subject => subject.id === 'sql')?.archived_at).toBeTruthy();
    expect(changed).not.toHaveBeenCalled();
  });

  it('still inserts a new name and leaves an in-use duplicate to the server (23505)', async () => {
    const { result } = await loaded();
    await act(async () => { await result.current.createSubject('데이터베이스'); });
    expect(db.calls.find(call => call.action === 'insert')?.payload).toEqual({ user_id: 'alice', name: '데이터베이스' });
    db.failure = { code: '23505' };
    let created: unknown;
    await act(async () => { created = await result.current.createSubject(' 코딩테스트 '); });
    expect(created).toBeNull();
    expect(db.calls.filter(call => call.action === 'insert')).toHaveLength(2);
    expect(result.current.error).toBe('같은 이름의 과목이 이미 있습니다.');
  });
});

// 공개 함수를 렌더 없이 이어서 부를 때(act 안에서 차례로 await) 판단 목록이 방금 바뀐 내용을 본다.
// 호출 사이에 rerender·waitFor를 넣지 않는다(렌더가 끝나면 숨겨지는 문제다).
describe('useStudySubjects decisions between calls before a render', () => {
  const ARCHIVED_AT = '2026-11-01T09:00:00.000Z';
  const writes = () => db.calls.filter(call => call.action !== 'select');
  const reads = () => db.calls.filter(call => call.action === 'select');
  const settle = () => new Promise(done => { setTimeout(done, 0); });

  it('restores right after archiving instead of inserting', async () => {
    db.rows = [{ id: 'a', user_id: 'alice', name: 'SQL', archived_at: null }];
    const { result } = await loaded();
    db.holdReads = true;
    let restored: unknown;
    await act(async () => {
      expect(await result.current.archiveSubject('a')).toBe(true);
      restored = await result.current.createSubject(' sql ');
    });
    expect(writes().map(call => call.action)).toEqual(['update', 'update']);
    expect(writes()[1]).toMatchObject({ payload: { archived_at: null }, filters: { user_id: 'alice', id: 'a', name: 'SQL' } });
    expect(restored).toEqual({ id: 'a', user_id: 'alice', name: 'SQL', archived_at: null });
    expect(result.current.error).toBeNull();
  });

  it('restores once when the same name is added twice in a row, then leaves the in-use duplicate to the server', async () => {
    db.rows = [{ id: 'a', user_id: 'alice', name: 'SQL', archived_at: ARCHIVED_AT }];
    const { result } = await loaded();
    db.holdReads = true;
    let first: unknown;
    let second: unknown;
    await act(async () => {
      first = await result.current.createSubject('sql');
      second = await result.current.createSubject('sql');
    });
    expect(first).toEqual({ id: 'a', user_id: 'alice', name: 'SQL', archived_at: null });
    expect(second).toBeNull();
    expect(writes().map(call => call.action)).toEqual(['update', 'insert']);
    expect(result.current.error).toBe('같은 이름의 과목이 이미 있습니다.');
  });

  it('decides from the list a finished refresh read, not from the last render', async () => {
    db.rows = [{ id: 'a', user_id: 'alice', name: 'SQL', archived_at: ARCHIVED_AT }];
    const { result } = await loaded();
    // 다른 탭이 a의 이름을 바꾸고 보관한 SQL(b)을 새로 두었다.
    db.rows = [
      { id: 'a', user_id: 'alice', name: 'NoSQL', archived_at: ARCHIVED_AT },
      { id: 'b', user_id: 'alice', name: 'SQL', archived_at: '2026-11-02T09:00:00.000Z' },
    ];
    let restored: unknown;
    await act(async () => {
      await result.current.refresh();
      db.holdReads = true;
      restored = await result.current.createSubject('sql');
    });
    expect(restored).toEqual({ id: 'b', user_id: 'alice', name: 'SQL', archived_at: null });
    expect(writes()).toEqual([expect.objectContaining({ action: 'update', filters: { user_id: 'alice', id: 'b', name: 'SQL' } })]);
    expect(db.rows.find(row => row.id === 'a')).toMatchObject({ name: 'NoSQL', archived_at: ARCHIVED_AT });
  });

  it('does not restore an archived subject that was renamed elsewhere since the list was read', async () => {
    db.rows = [{ id: 'a', user_id: 'alice', name: 'SQL', archived_at: ARCHIVED_AT }];
    const { result } = await loaded();
    // 다른 기기에서 이름만 바꿨다(이 탭에는 알림이 없다).
    db.rows[0].name = 'NoSQL';
    const before = reads().length;
    let created: unknown = 'pending';
    await act(async () => { created = await result.current.createSubject('sql'); });
    expect(created).toBeNull();
    expect(writes()).toEqual([expect.objectContaining({ action: 'update', payload: { archived_at: null }, filters: { user_id: 'alice', id: 'a', name: 'SQL' } })]);
    expect(db.rows[0]).toMatchObject({ name: 'NoSQL', archived_at: ARCHIVED_AT });
    expect(result.current.error).toBeNull();
    expect(changed).not.toHaveBeenCalled();
    // 0행이면 목록을 다시 읽어 바뀐 이름을 보인다.
    await waitFor(() => expect(result.current.subjects.map(subject => subject.name)).toEqual(['NoSQL']));
    expect(reads().length).toBeGreaterThan(before);

    // 과목 관리의 다시 사용 버튼(restoreSubject)은 ID로만 바꾼다.
    let restored: unknown;
    await act(async () => { restored = await result.current.restoreSubject('a'); });
    expect(restored).toBe(true);
    expect(writes()[1]).toMatchObject({ action: 'update', filters: { user_id: 'alice', id: 'a' } });
    expect(writes()[1].filters).not.toHaveProperty('name');
  });

  it('restoreSubject with a stored name changes only a row that still has that name', async () => {
    db.rows = [{ id: 'a', user_id: 'alice', name: 'SQL', archived_at: ARCHIVED_AT }];
    const { result } = await loaded();
    db.rows[0].name = 'NoSQL';
    let outcome: unknown;
    await act(async () => { outcome = await result.current.restoreSubject('a', 'SQL'); });
    expect(outcome).toBe(false);
    expect(writes()).toEqual([expect.objectContaining({ action: 'update', filters: { user_id: 'alice', id: 'a', name: 'SQL' } })]);
    expect(db.rows[0].archived_at).toBe(ARCHIVED_AT);
    expect(result.current.error).toBeNull();
    expect(changed).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.subjects.map(subject => subject.name)).toEqual(['NoSQL']));
    await act(async () => { outcome = await result.current.restoreSubject('a', 'NoSQL'); });
    expect(outcome).toBe(true);
    expect(db.rows[0].archived_at).toBeNull();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('counts a rename at once', async () => {
    db.rows = [{ id: 'a', user_id: 'alice', name: '블록체인', archived_at: ARCHIVED_AT }];
    const { result } = await loaded();
    db.holdReads = true;
    let restored: unknown;
    await act(async () => {
      expect(await result.current.renameSubject('a', ' SQL ')).toBe(true);
      restored = await result.current.createSubject('sql');
    });
    expect(writes().map(call => call.action)).toEqual(['update', 'update']);
    expect(writes()[1]).toMatchObject({ payload: { archived_at: null }, filters: { user_id: 'alice', id: 'a', name: 'SQL' } });
    expect(restored).toEqual({ id: 'a', user_id: 'alice', name: 'SQL', archived_at: null });
  });

  it('counts a deletion at once', async () => {
    db.rows = [{ id: 'a', user_id: 'alice', name: 'SQL', archived_at: ARCHIVED_AT }];
    db.rpc.mockImplementation(async () => {
      db.rows = db.rows.filter(row => row.id !== 'a');
      return { data: { status: 'deleted' }, error: null };
    });
    const { result } = await loaded();
    db.holdReads = true;
    let created: unknown;
    await act(async () => {
      expect(await result.current.deleteSubject('a')).toEqual({ status: 'deleted' });
      created = await result.current.createSubject('sql');
    });
    expect(writes().map(call => call.action)).toEqual(['insert']);
    expect(created).toMatchObject({ user_id: 'alice', name: 'sql' });
  });

  it('never decides from the previous account list after switching accounts', async () => {
    db.rows = [{ id: 'a', user_id: 'alice', name: 'SQL', archived_at: ARCHIVED_AT }];
    const view = await loaded();
    const aliceCreate = view.result.current.createSubject;
    // bob의 첫 읽기가 아직 오지 않았다.
    db.holdReads = true;
    view.rerender({ user: 'bob' });
    let created: unknown;
    let stale: unknown = 'pending';
    await act(async () => {
      created = await view.result.current.createSubject('sql');
      stale = await aliceCreate('sql');
    });
    expect(writes()).toEqual([expect.objectContaining({ action: 'insert', payload: { user_id: 'bob', name: 'sql' } })]);
    expect(created).toMatchObject({ user_id: 'bob', name: 'sql' });
    expect(stale).toBeNull();
    expect(db.rows.find(row => row.id === 'a')?.archived_at).toBe(ARCHIVED_AT);
  });

  it('ignores the previous account list that arrives after switching accounts', async () => {
    db.rows = [{ id: 'a', user_id: 'alice', name: 'SQL', archived_at: ARCHIVED_AT }];
    db.deferNextRead = true;
    const view = renderHook(({ user }: { user: string | null }) => useStudySubjects(user), { initialProps: { user: 'alice' as string | null } });
    await waitFor(() => expect(db.pendingRead).not.toBeNull());
    const aliceRead = db.pendingRead!;
    db.holdReads = true;
    view.rerender({ user: 'bob' });
    let created: unknown;
    await act(async () => {
      aliceRead({ data: [{ ...db.rows[0] }], error: null });
      await settle();
      created = await view.result.current.createSubject('sql');
    });
    expect(writes()).toEqual([expect.objectContaining({ action: 'insert', payload: { user_id: 'bob', name: 'sql' } })]);
    expect(created).toMatchObject({ user_id: 'bob', name: 'sql' });
    // bob의 목록에는 방금 만든 과목만 있고 alice의 과목은 없다.
    expect(view.result.current.subjects.map(subject => subject.user_id)).toEqual(['bob']);
  });

  it('does not let a reload that started before a change bring the older list back', async () => {
    db.rows = [{ id: 'a', user_id: 'alice', name: 'SQL', archived_at: null }];
    const { result } = await loaded();
    db.deferNextRead = true;
    act(() => { void result.current.refresh(); });
    await waitFor(() => expect(db.pendingRead).not.toBeNull());
    const olderRead = db.pendingRead!;
    db.holdReads = true;
    let restored: unknown;
    await act(async () => {
      expect(await result.current.archiveSubject('a')).toBe(true);
      // 보관하기 전에 읽은 목록(a 사용 중)이 늦게 온다.
      olderRead({ data: [{ id: 'a', user_id: 'alice', name: 'SQL', archived_at: null }], error: null });
      await settle();
      restored = await result.current.createSubject('sql');
    });
    expect(writes().map(call => call.action)).toEqual(['update', 'update']);
    expect(restored).toEqual({ id: 'a', user_id: 'alice', name: 'SQL', archived_at: null });
  });
});

describe('useStudySubjects late create, rename, archive and restore responses', () => {
  type Hook = ReturnType<typeof useStudySubjects>;
  const writes = {
    create: { send: (hook: Hook) => hook.createSubject('데이터베이스'), ok: { data: { id: 'new', user_id: 'alice', name: '데이터베이스' }, error: null } },
    rename: { send: (hook: Hook) => hook.renameSubject('a', '블록체인 이론'), ok: { data: { id: 'a' }, error: null } },
    archive: { send: (hook: Hook) => hook.archiveSubject('a'), ok: { data: { id: 'a', archived_at: '2026-11-09T09:00:00.000Z' }, error: null } },
    restore: { send: (hook: Hook) => hook.restoreSubject('a'), ok: { data: { id: 'a', archived_at: null }, error: null } },
  };
  const okResult = { create: { id: 'new', user_id: 'alice', name: '데이터베이스' }, rename: true, archive: true, restore: true };
  const staleResult = { create: null, rename: false, archive: false, restore: false };

  // 요청을 보낸 뒤 같은 계정에서 훅만 언마운트하고(예: 과목 관리 패널을 접음) 응답을 돌려준다.
  async function writeThenUnmount(kind: keyof typeof writes, signedInAs: string | null) {
    db.signedInAs = signedInAs;
    const view = await loaded();
    db.deferNextWrite = true;
    let pending!: Promise<unknown>;
    act(() => { pending = writes[kind].send(view.result.current); });
    await waitFor(() => expect(db.pendingWrite).not.toBeNull());
    view.unmount();
    return async (response: unknown) => {
      let outcome: unknown;
      await act(async () => { db.pendingWrite?.(response); outcome = await pending; });
      return outcome;
    };
  }

  it.each([
    ['create', null],
    ['create', 'alice'],
    ['rename', null],
    ['rename', 'alice'],
    ['archive', null],
    ['archive', 'alice'],
    ['restore', null],
    ['restore', 'alice'],
  ] as const)('%s still announces a saved change once after unmount (signed in as %s) and returns it', async (kind, signedInAs) => {
    const settle = await writeThenUnmount(kind, signedInAs);
    const consoleError = vi.spyOn(console, 'error');
    expect(await settle(writes[kind].ok)).toEqual(okResult[kind]);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each([
    ['create', { data: null, error: { code: '23505' } }],
    ['create', { data: null, error: { code: '42501' } }],
    ['rename', { data: null, error: { code: '23505' } }],
    ['rename', { data: null, error: null }],
    ['archive', { data: null, error: { code: 'PGRST116' } }],
    ['archive', { data: null, error: { code: '42501' } }],
    ['restore', { data: null, error: { code: 'PGRST116' } }],
    ['restore', { data: null, error: null }],
  ] as const)('%s sends no change event when the late response after unmount is a failure (%j)', async (kind, response) => {
    const settle = await writeThenUnmount(kind, null);
    const reads = db.calls.filter(call => call.action === 'select').length;
    expect(await settle(response)).toEqual(staleResult[kind]);
    expect(changed).not.toHaveBeenCalled();
    // 닫힌 화면은 다시 읽지 않는다(0행이어도).
    expect(db.calls.filter(call => call.action === 'select')).toHaveLength(reads);
  });

  it.each(['create', 'rename', 'archive', 'restore'] as const)('%s treats a late response after unmount as stale when another account is now signed in', async kind => {
    const settle = await writeThenUnmount(kind, 'alice');
    // 사용자 키로 다시 그려지는 화면은 계정을 바꾸면 언마운트된다. 그 사이 저장된 세션이 bob으로 바뀌었다.
    db.signedInAs = 'bob';
    expect(await settle(writes[kind].ok)).toEqual(staleResult[kind]);
    expect(changed).not.toHaveBeenCalled();
  });

  it.each(['create', 'rename', 'archive', 'restore'] as const)('%s ignores a late response after the mounted hook switches accounts', async kind => {
    const { result, rerender } = await loaded();
    db.deferNextWrite = true;
    let pending!: Promise<unknown>;
    act(() => { pending = writes[kind].send(result.current); });
    await waitFor(() => expect(db.pendingWrite).not.toBeNull());
    rerender({ user: 'bob' });
    await waitFor(() => expect(ids(result.current.subjects)).toEqual(['c']));
    let outcome: unknown;
    await act(async () => { db.pendingWrite?.(writes[kind].ok); outcome = await pending; });
    expect(outcome).toEqual(staleResult[kind]);
    expect(ids(result.current.subjects)).toEqual(['c']);
    expect(result.current.error).toBeNull();
    expect(changed).not.toHaveBeenCalled();
  });
});
