import { act, cleanup, render, screen } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { simulateCssAnimations } from '@/components/ui/__tests__/motionTestUtils';

const state = vi.hoisted(() => ({
  session: null as unknown,
  requests: { count: 0, loaded: false },
}));

vi.mock('@/hooks/useAuthSession', () => ({ useAuthSession: () => ({ session: state.session, loading: false }) }));
vi.mock('@/hooks/useFriendRequestCount', () => ({ useFriendRequestState: () => state.requests }));

import NotificationBell from '../NotificationBell';
import { ShellProvider, useShell } from '../ShellProvider';

const sessionFor = (id: string) => ({ user: { id } }) as unknown as Session;

function Probe() {
  const { friendRequestCount, friendRequestPulse } = useShell();
  return <p data-testid="probe">{`${friendRequestCount}/${friendRequestPulse}`}</p>;
}

function App({ bellKey = 'bell' }: { bellKey?: string }) {
  return (
    <ShellProvider>
      <Probe />
      <NotificationBell key={bellKey} />
    </ShellProvider>
  );
}

const probe = () => screen.getByTestId('probe').textContent;
const badge = () => screen.getByRole('button', { name: /^알림/ }).querySelector('span[aria-hidden="true"]');

describe('ShellProvider friend request pulse and the bell badge', () => {
  beforeEach(() => {
    state.session = sessionFor('user-a');
    state.requests = { count: 0, loaded: false };
  });
  afterEach(() => cleanup());

  it('does not pop for the count of the first load', () => {
    const { rerender } = render(<App />);
    expect(probe()).toBe('0/0');

    state.requests = { count: 2, loaded: true };
    rerender(<App />);
    expect(probe()).toBe('2/0');
    expect(badge()).not.toHaveClass('animate-pop-in');
  });

  it('pops once when a new request arrives, but not when the bell is drawn again on another screen', async () => {
    const animations = simulateCssAnimations();
    try {
      state.requests = { count: 1, loaded: true };
      const { rerender } = render(<App />);
      expect(badge()).not.toHaveClass('animate-pop-in');

      state.requests = { count: 2, loaded: true };
      rerender(<App />);
      expect(probe()).toBe('2/1');
      const popped = badge()!;
      expect(popped).toHaveClass('animate-pop-in');

      // 다시 그려도(같은 펄스) 그대로이고, 다 튀면 뗀다. 화면을 옮겨 종을 새로 그리면 튀지 않는다.
      rerender(<App />);
      expect(probe()).toBe('2/1');
      expect(badge()).toBe(popped);
      await animations.finish(popped);
      expect(popped).not.toHaveClass('animate-pop-in');
      rerender(<App bellKey="next-screen" />);
      expect(badge()).not.toHaveClass('animate-pop-in');
    } finally {
      animations.restore();
    }
  });

  it('ignores decreases and account switches', () => {
    state.requests = { count: 3, loaded: true };
    const { rerender } = render(<App />);

    state.requests = { count: 1, loaded: true };
    rerender(<App />);
    expect(probe()).toBe('1/0');

    state.session = sessionFor('user-b');
    state.requests = { count: 0, loaded: false };
    rerender(<App />);
    state.requests = { count: 4, loaded: true };
    rerender(<App />);
    expect(probe()).toBe('4/0');

    state.requests = { count: 5, loaded: true };
    rerender(<App />);
    expect(probe()).toBe('5/1');
  });
});

// 셸이 설치하는 닫힘 가드(components/ui/popoverExit): StrictMode의 설치 → 정리 → 설치 뒤에도 하나만 동작한다.
describe('ShellProvider closing popover guard', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.querySelectorAll('[data-guard-fixture]').forEach((element) => element.remove());
  });

  it('leaves exactly one active guard after a StrictMode setup → cleanup → setup', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const pressListeners = (spy: typeof add) => spy.mock.calls.filter(([type, , options]) => type === 'pointerdown' && options === true).length;

    render(<StrictMode><ShellProvider><p>셸</p></ShellProvider></StrictMode>);
    expect(pressListeners(add) - pressListeners(remove)).toBe(1);

    const fixture = document.createElement('div');
    fixture.setAttribute('data-guard-fixture', '');
    fixture.innerHTML = '<button id="guard-trigger" aria-controls="guard-content">열기</button>'
      + '<div class="ui-popover" id="guard-content" data-state="open"><a href="#" id="guard-link">링크</a></div>';
    document.body.appendChild(fixture);
    await act(async () => {});
    const content = document.getElementById('guard-content')!;
    const listen = vi.spyOn(content, 'addEventListener');
    document.getElementById('guard-link')!.focus();
    content.setAttribute('data-state', 'closed');
    await act(async () => {});

    expect(content).toHaveAttribute('inert');
    expect(document.getElementById('guard-trigger')).toHaveFocus();
    expect(listen.mock.calls.filter(([type]) => type === 'focusScope.autoFocusOnUnmount')).toHaveLength(1);

    // 내리면 가드가 바꿔 둔 것을 되돌린다.
    cleanup();
    expect(pressListeners(add) - pressListeners(remove)).toBe(0);
    expect(content).not.toHaveAttribute('inert');
  });
});
