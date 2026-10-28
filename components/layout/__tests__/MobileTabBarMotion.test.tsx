import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ pathname: '/plan' }));
const shell = vi.hoisted(() => ({ friendRequestCount: 1, friendRequestPulse: 0 }));

vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));
vi.mock('@/components/layout/ShellProvider', () => ({
  useShell: () => ({ session: null, ...shell }),
}));

import MobileTabBar from '../MobileTabBar';

const friendsTab = () => screen.getByRole('link', { name: /^친구/ });
const requestDot = () => friendsTab().querySelector('span.relative > span');

describe('MobileTabBar motion', () => {
  beforeEach(() => {
    navigation.pathname = '/plan';
    shell.friendRequestCount = 1;
    shell.friendRequestPulse = 0;
  });
  afterEach(() => cleanup());

  it('gives every tab press feedback and a colour crossfade', () => {
    render(<MobileTabBar />);

    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveClass('ui-press', 'transition-[color,scale]');
    }
  });

  it('pops the friend dot once for a request that arrives while the bar is shown, never on load', () => {
    shell.friendRequestPulse = 3;
    const { rerender } = render(<MobileTabBar />);
    expect(requestDot()).not.toHaveClass('animate-pop-in');

    shell.friendRequestCount = 2;
    shell.friendRequestPulse = 4;
    rerender(<MobileTabBar />);
    const popped = requestDot();
    expect(friendsTab()).toHaveAccessibleName('친구, 받은 친구 요청 2개');
    expect(popped).toHaveClass('animate-pop-in');

    // 다른 탭으로 옮겨도 같은 점이 남아 다시 튀지 않는다.
    navigation.pathname = '/groups';
    rerender(<MobileTabBar />);
    expect(requestDot()).toBe(popped);
  });

  it('does not pop a request that came in while the bar was hidden or after the dot was gone', () => {
    const { rerender } = render(<MobileTabBar />);

    navigation.pathname = '/settings';
    shell.friendRequestCount = 2;
    shell.friendRequestPulse = 1;
    rerender(<MobileTabBar />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();

    navigation.pathname = '/profile';
    rerender(<MobileTabBar />);
    expect(requestDot()).not.toHaveClass('animate-pop-in');

    // 요청을 모두 처리해 점이 사라졌다가 새 요청이 오면 다시 튄다.
    shell.friendRequestCount = 0;
    rerender(<MobileTabBar />);
    expect(requestDot()).toBeNull();
    shell.friendRequestCount = 1;
    shell.friendRequestPulse = 2;
    rerender(<MobileTabBar />);
    expect(requestDot()).toHaveClass('animate-pop-in');
  });
});
