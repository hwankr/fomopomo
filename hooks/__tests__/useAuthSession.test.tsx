import { StrictMode, useLayoutEffect } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type GetSessionResult = { data: { session: Session | null }; error: { message: string } | null };

type Listener = (event: AuthChangeEvent, session: Session | null) => void;

const { auth, pendingChecks, listeners, signOutWithPushCleanup } = vi.hoisted(() => {
  const pendingChecks: Array<(result: GetSessionResult) => void> = [];
  // 구독한 순서대로 둔다(effect가 먼저 돈 화면이 앞).
  const listeners: Listener[] = [];
  return {
    pendingChecks,
    listeners,
    signOutWithPushCleanup: vi.fn(async () => ({ ok: true })),
    auth: {
      getSession: vi.fn(() => new Promise<GetSessionResult>((resolve) => pendingChecks.push(resolve))),
      onAuthStateChange: vi.fn((callback: Listener) => {
        listeners.push(callback);
        const unsubscribe = () => {
          const index = listeners.indexOf(callback);
          if (index >= 0) listeners.splice(index, 1);
        };
        return { data: { subscription: { unsubscribe } } };
      }),
    },
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: { auth } }));
vi.mock('@/lib/pushSubscriptionLifecycle', () => ({ signOutWithPushCleanup }));

import { __resetAuthSessionForTests, useAuthSession } from '@/hooks/useAuthSession';

const sessionFor = (id: string) => ({ user: { id }, access_token: `token-${id}` }) as unknown as Session;

// 그릴 때마다 본 상태를 남긴다. 첫 그림이 무엇이었는지가 헤더가 사라지는지를 가른다.
// 화면을 여럿 붙이는 테스트는 name으로 화면마다 따로 모은다.
let renders: string[] = [];
let rendersOf: Record<string, string[]> = {};
const describeState = ({ session, loading }: { session: Session | null; loading: boolean }) =>
  loading ? 'loading' : session ? `user:${session.user.id}` : 'guest';

function Probe({ name = 'auth' }: { name?: string }) {
  const state = useAuthSession();
  const text = describeState(state);
  renders.push(text);
  (rendersOf[name] ??= []).push(text);
  return <p data-testid={name}>{text}</p>;
}

const shown = (name = 'auth') => screen.getByTestId(name).textContent;

async function finishCheck(result: GetSessionResult) {
  await act(async () => {
    for (const resolve of pendingChecks.splice(0)) resolve(result);
  });
}

// 실제 auth-js처럼 보낸다. 로그인 상태가 바뀐 이벤트는 지금 붙어 있는 모든 구독에 보내고(_notifyAllSubscribers),
// INITIAL_SESSION은 구독할 때마다 그 구독 하나에만 보낸다(_emitInitialSession). 모두에게 보내면 "INITIAL_SESSION이
// revision을 올려 다른 구독의 정상 조회를 버리는" 실수를 테스트가 못 잡는다.
async function emit(event: AuthChangeEvent, session: Session | null) {
  if (event === 'INITIAL_SESSION') throw new Error('INITIAL_SESSION은 구독 하나에만 온다. emitInitialSession을 쓴다.');
  await act(async () => {
    for (const listener of [...listeners]) listener(event, session);
  });
}

// 기본은 가장 나중에 붙은 구독(방금 붙은 화면)에 보낸다.
async function emitInitialSession(session: Session | null, listener: Listener | undefined = listeners.at(-1)) {
  if (!listener) throw new Error('구독이 없다');
  await act(async () => {
    listener('INITIAL_SESSION', session);
  });
}

// 이 화면이 렌더된 뒤, 이 화면의 구독(useEffect)이 붙기 전에 오는 인증 이벤트.
// 같은 커밋의 레이아웃 효과에서 그때 붙어 있는 구독(레이아웃의 ShellProvider 같은 화면)에만 보낸다.
function EventBeforeSubscribe({ event, session }: { event: AuthChangeEvent; session: Session | null }) {
  useLayoutEffect(() => {
    for (const listener of [...listeners]) listener(event, session);
  }, [event, session]);
  return null;
}

// 화면 하나를 붙였다가(로그인 확인까지 끝내고) 떼서, 탭이 그 상태를 알게 만든다.
async function visitScreen(result: GetSessionResult) {
  const view = render(<Probe />);
  await finishCheck(result);
  view.unmount();
}

describe('useAuthSession', () => {
  beforeEach(() => {
    __resetAuthSessionForTests();
    pendingChecks.length = 0;
    listeners.length = 0;
    renders = [];
    rendersOf = {};
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('starts loading on the first mount and settles once the session is checked', async () => {
    render(<Probe />);
    expect(renders[0]).toBe('loading');

    await finishCheck({ data: { session: sessionFor('a') }, error: null });
    expect(shown()).toBe('user:a');
  });

  it('draws a screen mounted after the check with that session right away, then checks again', async () => {
    await visitScreen({ data: { session: sessionFor('a') }, error: null });
    renders = [];

    render(<Probe />);
    expect(renders[0]).toBe('user:a');
    expect(auth.getSession).toHaveBeenCalledTimes(2);

    // 다시 확인한 결과가 다르면(그 사이 다른 곳에서 로그아웃) 그쪽을 따른다.
    await finishCheck({ data: { session: null }, error: null });
    expect(shown()).toBe('guest');
  });

  it('reuses a known guest state too', async () => {
    await visitScreen({ data: { session: null }, error: null });
    renders = [];

    render(<Probe />);
    expect(renders[0]).toBe('guest');
  });

  it('never brings back the previous session after SIGNED_OUT', async () => {
    const shell = render(<Probe />);
    await finishCheck({ data: { session: sessionFor('a') }, error: null });

    await emit('SIGNED_OUT', null);
    expect(shown()).toBe('guest');
    shell.unmount();
    renders = [];

    render(<Probe />);
    expect(renders[0]).toBe('guest');
    expect(renders).not.toContain('user:a');
  });

  it('follows an account switch instead of the old account', async () => {
    const shell = render(<Probe />);
    await finishCheck({ data: { session: sessionFor('a') }, error: null });

    await emit('SIGNED_IN', sessionFor('b'));
    shell.unmount();
    renders = [];

    render(<Probe />);
    expect(renders[0]).toBe('user:b');
  });

  it('signs out on a refresh token error and forgets the session', async () => {
    await visitScreen({ data: { session: sessionFor('a') }, error: null });

    const view = render(<Probe />);
    await finishCheck({ data: { session: null }, error: { message: 'Invalid Refresh Token: Refresh Token Not Found' } });
    expect(signOutWithPushCleanup).toHaveBeenCalledTimes(1);
    expect(shown()).toBe('guest');
    view.unmount();
    renders = [];

    render(<Probe />);
    expect(renders[0]).toBe('guest');
  });

  it('keeps the first page load the same as the server render (loading) even when a session is known', async () => {
    await visitScreen({ data: { session: sessionFor('a') }, error: null });

    const serverHTML = renderToString(<Probe />);
    expect(serverHTML).toContain('loading');

    const container = document.createElement('div');
    container.innerHTML = serverHTML;
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    renders = [];
    let root: Root | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <Probe />, { onRecoverableError });
      });
      expect(renders[0]).toBe('loading');
      expect(onRecoverableError).not.toHaveBeenCalled();

      await finishCheck({ data: { session: sessionFor('a') }, error: null });
      expect(container.textContent).toBe('user:a');
    } finally {
      act(() => root?.unmount());
      container.remove();
    }
  });

  // 아래는 늦게 끝난 getSession이 더 새 인증 이벤트를 덮지 않는지 본다.
  // 레이아웃의 ShellProvider처럼 계속 붙어 있는 화면(shell) 옆에서 다른 화면이 붙었다 떨어진다.
  const A = { data: { session: sessionFor('a') }, error: null };
  const refreshTokenError = { data: { session: null }, error: { message: 'Invalid Refresh Token: Refresh Token Not Found' } };

  it('(a) drops a check that a left screen started before SIGNED_OUT, so the next screen starts as guest', async () => {
    render(<Probe name="shell" />);
    await finishCheck(A);

    const left = render(<Probe name="left" />);
    expect(pendingChecks).toHaveLength(1);
    left.unmount();
    await emit('SIGNED_OUT', null);
    await finishCheck(A); // 떠난 화면의 조회가 이제야 끝난다.

    render(<Probe name="next" />);
    expect(rendersOf.next[0]).toBe('guest');
    expect(rendersOf.next).not.toContain('user:a');
    expect(shown('shell')).toBe('guest');
  });

  it('(b) drops the same late check after an account switch, so the next screen starts as the new account', async () => {
    render(<Probe name="shell" />);
    await finishCheck(A);

    const left = render(<Probe name="left" />);
    left.unmount();
    await emit('SIGNED_IN', sessionFor('b'));
    await finishCheck(A);

    render(<Probe name="next" />);
    expect(rendersOf.next[0]).toBe('user:b');
    expect(rendersOf.next).not.toContain('user:a');
    expect(shown('shell')).toBe('user:b');
  });

  it('(c) keeps a live screen as guest when SIGNED_OUT lands while its check is pending, and still ends loading', async () => {
    render(<Probe name="screen" />);
    await emit('SIGNED_OUT', null);
    await finishCheck(A); // 로그아웃 전에 시작한 조회의 늦은 응답

    expect(shown('screen')).toBe('guest');
    expect(rendersOf.screen).not.toContain('user:a');
    expect(rendersOf.screen.at(-1)).toBe('guest');

    render(<Probe name="next" />);
    expect(rendersOf.next[0]).toBe('guest');
  });

  it('(d) never draws loading or guest on a screen that reused the session and is confirmed as the same user', async () => {
    render(<Probe name="shell" />);
    await finishCheck(A);

    render(<Probe name="screen" />);
    // 붙는 동안(렌더·effect) 한 번만 그린다. 놓친 이벤트가 없으면 따라잡으려고 다시 그리지 않는다.
    expect(rendersOf.screen).toEqual(['user:a']);
    // 다시 확인하는 동안 오는 것들: 저장소 읽기 오류로 오는 null INITIAL_SESSION, 같은 사용자의 INITIAL_SESSION,
    // 새 객체로 돌아온 getSession 결과, 토큰 갱신. INITIAL_SESSION은 이 화면의 구독에만 온다.
    await emitInitialSession(null);
    await emitInitialSession(sessionFor('a'));
    await finishCheck({ data: { session: sessionFor('a') }, error: null });
    await emit('TOKEN_REFRESHED', sessionFor('a'));

    expect(rendersOf.screen.length).toBeGreaterThan(0);
    expect(rendersOf.screen.every((state) => state === 'user:a')).toBe(true);
  });

  it('(e) follows SIGNED_OUT on a screen that reused the session, whether its check is done or still pending', async () => {
    render(<Probe name="shell" />);
    await finishCheck(A);

    // 확인이 끝난 뒤 로그아웃
    const done = render(<Probe name="done" />);
    await finishCheck(A);
    await emit('SIGNED_OUT', null);
    expect(shown('done')).toBe('guest');
    done.unmount();

    // 다시 로그인한 뒤, 확인이 끝나기 전에 로그아웃(늦은 응답은 버린다)
    await emit('SIGNED_IN', sessionFor('a'));
    render(<Probe name="pending" />);
    expect(rendersOf.pending[0]).toBe('user:a');
    await emit('SIGNED_OUT', null);
    await finishCheck(A);
    expect(shown('pending')).toBe('guest');
    expect(rendersOf.pending.slice(rendersOf.pending.indexOf('guest'))).not.toContain('user:a');
  });

  it('(f) treats INITIAL_SESSION as a read, not a change: a null one is not a sign-out and a stale one is dropped', async () => {
    // null INITIAL_SESSION(세션 없음 또는 읽기 오류)은 게스트로 보지 않고, revision도 올리지 않아 진행 중인 조회를 버리지 않는다.
    const first = render(<Probe name="first" />);
    await emitInitialSession(null);
    expect(shown('first')).toBe('loading');
    await finishCheck(A);
    expect(shown('first')).toBe('user:a');
    expect(rendersOf.first).not.toContain('guest');

    // 구독한 뒤 더 새 이벤트(로그아웃)가 있었다면, 그보다 먼저 읽은 INITIAL_SESSION은 버린다.
    render(<Probe name="screen" />);
    await emit('SIGNED_OUT', null);
    await emitInitialSession(sessionFor('a')); // 방금 붙은 screen의 구독에만 온다.
    expect(shown('screen')).toBe('guest');
    expect(shown('first')).toBe('guest');
    first.unmount();

    render(<Probe name="next" />);
    expect(rendersOf.next[0]).toBe('guest');
  });

  it('(g) ignores a stale refresh token error that arrives after a new sign-in', async () => {
    render(<Probe name="screen" />);
    await emit('SIGNED_IN', sessionFor('b'));
    await finishCheck(refreshTokenError); // 새 로그인 전에 시작한 조회의 오류

    expect(signOutWithPushCleanup).not.toHaveBeenCalled();
    expect(shown('screen')).toBe('user:b');

    render(<Probe name="next" />);
    expect(rendersOf.next[0]).toBe('user:b');
  });

  it('still cleans up a current refresh token error even though the SDK sends SIGNED_OUT during that same check', async () => {
    // auth-js는 refresh token이 거부되면 세션을 지우며 SIGNED_OUT을 먼저 보내고, 그다음 getSession이 오류를 돌려준다.
    await visitScreen(A);
    render(<Probe name="screen" />);
    await emit('SIGNED_OUT', null);
    await finishCheck(refreshTokenError);

    expect(signOutWithPushCleanup).toHaveBeenCalledTimes(1);
    expect(shown('screen')).toBe('guest');

    render(<Probe name="next" />);
    expect(rendersOf.next[0]).toBe('guest');
  });

  // 아래는 이 화면이 렌더된 뒤 구독이 붙기 전(렌더와 effect 사이)에 온 이벤트다. 그 이벤트는 레이아웃의 shell만 받는다.
  const fetchFailed = { data: { session: null }, error: { message: 'fetch failed' } };
  const quietly = async (run: () => Promise<void>) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await run();
    } finally {
      spy.mockRestore();
    }
  };

  it.each([
    { name: 'an account switch', event: 'SIGNED_IN' as const, session: sessionFor('b'), expected: 'user:b' },
    { name: 'a sign-out', event: 'SIGNED_OUT' as const, session: null, expected: 'guest' },
    { name: 'an account switch under StrictMode', event: 'SIGNED_IN' as const, session: sessionFor('b'), expected: 'user:b', strict: true },
  ])('catches up with $name it missed before subscribing, even when its own read fails', async ({ event, session, expected, strict }) => {
    render(<Probe name="shell" />);
    await finishCheck(A);

    const screenWithGap = (
      <>
        <Probe name="next" />
        <EventBeforeSubscribe event={event} session={session} />
      </>
    );
    render(strict ? <StrictMode>{screenWithGap}</StrictMode> : screenWithGap);
    // 렌더 때는 기억한 A로 그렸지만, 구독을 붙이며 shell이 받은 상태로 맞춘다.
    expect(rendersOf.next[0]).toBe('user:a');
    expect(shown('shell')).toBe(expected);
    expect(shown('next')).toBe(expected);

    // 이 화면의 읽기는 모두 실패한다: null INITIAL_SESSION, getSession의 일반 오류.
    await emitInitialSession(null);
    await quietly(() => finishCheck(fetchFailed));
    expect(shown('next')).toBe(expected);
    expect(rendersOf.next.slice(rendersOf.next.indexOf(expected))).not.toContain('user:a');
  });

  it('keeps its own check when an event lands between its render and its subscription', async () => {
    // 아직 아무 확인도 끝나지 않은 탭(기억한 상태 없음)에서 화면이 붙는 사이 로그인 이벤트가 shell에만 온다.
    // 이 화면은 그 이벤트를 못 받았으므로, 구독을 붙인 뒤 시작한 자기 조회 결과는 버리지 않아야 한다.
    render(<Probe name="shell" />);
    render(
      <>
        <Probe name="next" />
        <EventBeforeSubscribe event="SIGNED_IN" session={sessionFor('b')} />
      </>,
    );
    expect(rendersOf.next[0]).toBe('loading');

    await finishCheck({ data: { session: sessionFor('b') }, error: null });
    expect(shown('shell')).toBe('user:b');
    expect(shown('next')).toBe('user:b');
    expect(rendersOf.next).not.toContain('guest');
  });

  it('lets every subscription take its own INITIAL_SESSION, which the SDK sends to one subscription only', async () => {
    // 레이아웃처럼 셋이 함께 붙는다. 각 구독이 자기 INITIAL_SESSION을 받는다. INITIAL_SESSION이 revision을 올리면
    // 먼저 받은 하나만 로그인으로 남고 나머지는 자기 조회 결과를 버려 게스트가 된다.
    render(
      <>
        <Probe name="page" />
        <Probe name="listener" />
        <Probe name="shell" />
      </>,
    );
    expect(listeners).toHaveLength(3);
    for (const listener of [...listeners]) await emitInitialSession(sessionFor('a'), listener);
    await finishCheck(A);

    expect([shown('page'), shown('listener'), shown('shell')]).toEqual(['user:a', 'user:a', 'user:a']);
    expect(Object.values(rendersOf).flat()).not.toContain('guest');
  });

  it('keeps a sign-in that lands while the refresh token cleanup is still running', async () => {
    let release = () => {};
    signOutWithPushCleanup.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ ok: true }))),
    );
    render(<Probe name="screen" />);
    await finishCheck(refreshTokenError);
    expect(signOutWithPushCleanup).toHaveBeenCalledTimes(1);

    // 정리가 끝나기 전에 다른 탭 등에서 새로 로그인한다. 정리가 끝난 뒤 그 로그인을 게스트로 덮지 않는다.
    await emit('SIGNED_IN', sessionFor('b'));
    await act(async () => release());
    expect(shown('screen')).toBe('user:b');

    render(<Probe name="next" />);
    expect(rendersOf.next[0]).toBe('user:b');
  });

  it('does not remember a check that ends after its screen left, even with no other screen listening', async () => {
    // shell이 없으면 로그아웃 이벤트가 revision을 올리지 못한다. 떠난 화면의 늦은 응답은 그 자체로 버려야 한다.
    const left = render(<Probe name="left" />);
    left.unmount();
    await emit('SIGNED_OUT', null);
    await finishCheck(A);

    render(<Probe name="next" />);
    expect(rendersOf.next[0]).toBe('loading');
  });

  it('still cleans up a current refresh token error that returns after its screen left', async () => {
    // 저장소 정리는 화면이 아니라 탭의 일이라 화면이 떠났어도 한다(SDK 순서: SIGNED_OUT 뒤 오류).
    render(<Probe name="shell" />);
    await finishCheck(A);
    const left = render(<Probe name="left" />);
    left.unmount();
    await emit('SIGNED_OUT', null);
    await finishCheck(refreshTokenError);

    expect(signOutWithPushCleanup).toHaveBeenCalledTimes(1);
    expect(shown('shell')).toBe('guest');
  });
});
