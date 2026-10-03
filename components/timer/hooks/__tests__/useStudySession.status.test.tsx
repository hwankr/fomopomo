import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getUser: vi.fn(), from: vi.fn(),
  writes: [] as { payload: Record<string, unknown>; owner: string; authorization: string; condition: string }[],
  privacy: [] as ((response: { data: { is_task_public: boolean } | null; error?: { message: string } }) => void)[],
  updateError: null as { message: string } | null,
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: mocks.getSession, getUser: mocks.getUser }, from: mocks.from } }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }) }));
import { useStudySession } from '../useStudySession';

const token = (id: string) => ({ data: { session: { user: { id }, access_token: `token-${id}` } }, error: null });
const setOwner = (id: string) => localStorage.setItem('sb-status-auth-token', JSON.stringify({ user: { id } }));
const mount = () => renderHook(({ title }) => useStudySession({ isLoggedIn: true, selectedTaskTitle: title, onRecordSaved: vi.fn() }), { initialProps: { title: 'A private task' } });

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mocks.writes.length = 0; mocks.privacy.length = 0; mocks.updateError = null;
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://status.supabase.co'); setOwner('a');
  mocks.getUser.mockResolvedValue({ data: { user: null } });
  mocks.getSession.mockResolvedValue(token('a'));
  mocks.from.mockImplementation(() => {
    let payload: Record<string, unknown> = {}; let owner = ''; let authorization = ''; let condition = '';
    const query = {
      select: vi.fn(() => query),
      update: vi.fn((patch: Record<string, unknown>) => { payload = patch; return query; }),
      eq: vi.fn((_key: string, value: string) => { owner = value; return query; }),
      in: vi.fn(() => query), is: vi.fn(() => query),
      or: vi.fn((value: string) => { condition = value; return query; }),
      setHeader: vi.fn((_name: string, value: string) => { authorization = value; return query; }),
      single: vi.fn(() => new Promise(resolve => mocks.privacy.push(resolve))),
      then: (resolve: (value: { error: typeof mocks.updateError }) => void) => {
        mocks.writes.push({ payload, owner, authorization, condition }); resolve({ error: mocks.updateError });
      },
    };
    return query;
  });
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('profile status ordering and owner binding', () => {
  it('drops a delayed start after pause and stamps the interaction time', async () => {
    const { result } = mount();
    let start!: Promise<void>; let pause!: Promise<void>;
    await act(async () => { start = result.current.updateStatus('studying', undefined, new Date().toISOString(), 0); });
    expect(mocks.privacy).toHaveLength(1);
    const pausedAt = Date.now() - 5000;
    await act(async () => { pause = result.current.updateStatus('paused', undefined, undefined, 60, 'stopwatch', 'focus', 0, pausedAt); });
    expect(mocks.privacy).toHaveLength(1); // newer write waits behind the first
    await act(async () => { mocks.privacy[0]({ data: { is_task_public: true } }); await start; });
    expect(mocks.privacy).toHaveLength(2);
    await act(async () => { mocks.privacy[1]({ data: { is_task_public: true } }); await pause; });
    expect(mocks.writes).toEqual([{
      payload: expect.objectContaining({ status: 'paused', study_start_time: null, total_stopwatch_time: 60, last_active_at: new Date(pausedAt).toISOString() }),
      owner: 'a', authorization: 'Bearer token-a',
      condition: `last_active_at.is.null,last_active_at.lte.${new Date(pausedAt).toISOString()}`,
    }]);
  });

  it('rejects credentials for a replacement account before any profile request', async () => {
    const { result, rerender } = mount();
    let finish!: (value: ReturnType<typeof token>) => void;
    mocks.getSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    let saving!: Promise<void>;
    await act(async () => { saving = result.current.updateStatus('studying'); });
    setOwner('b'); rerender({ title: 'B task' });
    await act(async () => { finish(token('b')); await saving; });
    expect(mocks.privacy).toHaveLength(0); expect(mocks.writes).toHaveLength(0);
  });

  it('rejects a stale privacy result even after switching back to the original account', async () => {
    const { result, rerender } = mount();
    let saving!: Promise<void>;
    await act(async () => { saving = result.current.updateStatus('studying'); });
    setOwner('b'); rerender({ title: 'B task' });
    setOwner('a'); rerender({ title: 'A new task' });
    await act(async () => { mocks.privacy[0]({ data: { is_task_public: true } }); await saving; });
    expect(mocks.writes).toHaveLength(0);
  });

  it('pins the captured token and keeps private task labels out of presence', async () => {
    const { result } = mount();
    let saving!: Promise<void>;
    await act(async () => { saving = result.current.updateStatus('paused', undefined, undefined, 60); });
    mocks.getSession.mockResolvedValue(token('b'));
    await act(async () => { mocks.privacy[0]({ data: { is_task_public: false } }); await saving; });
    expect(mocks.writes[0]).toMatchObject({ owner: 'a', authorization: 'Bearer token-a', payload: { current_task: null } });
  });

  it('fails closed when privacy cannot be read and lets the next status proceed', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = mount();
    let first!: Promise<void>;
    await act(async () => { first = result.current.updateStatus('studying'); });
    await act(async () => { mocks.privacy[0]({ data: null, error: { message: 'network' } }); await first; });
    expect(mocks.writes).toHaveLength(0); expect(error).toHaveBeenCalled();
    let next!: Promise<void>;
    await act(async () => { next = result.current.updateStatus('paused'); });
    await act(async () => { mocks.privacy[1]({ data: { is_task_public: true } }); await next; });
    expect(mocks.writes).toHaveLength(1);
  });
});
