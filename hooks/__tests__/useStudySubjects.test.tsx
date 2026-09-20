import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  rows: [] as { id: string; user_id: string; name: string }[],
  calls: [] as { action: string; owner: unknown; payload: Record<string, unknown> }[],
  pendingRead: null as null | ((value: unknown) => void),
  deferNextRead: false,
  failure: null as { code: string } | null,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
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
import { notifyStudySubjectsChanged } from '@/lib/studySubjects';

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
});
afterEach(cleanup);

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
