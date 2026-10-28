import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
const shell = vi.hoisted(() => ({ friendRequestCount: 0 }));

vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));
vi.mock('@/components/layout/ShellProvider', () => ({
  useShell: () => ({ session: null, friendRequestCount: shell.friendRequestCount }),
}));

import MobileTabBar from '../MobileTabBar';
import { getActiveSection, isTabBarRoute } from '../navigation';

describe('navigation helpers', () => {
  it.each([
    ['/', 'timer'],
    ['/plan', 'plan'],
    ['/friends', 'friends'],
    ['/groups', 'groups'],
    ['/groups/abc-123', 'groups'],
    ['/profile', 'profile'],
    ['/settings', null],
    ['/terms', null],
    ['/privacy', null],
    ['/contact', null],
    ['/support', null],
    ['/admin', null],
    ['/planner', null],
    [null, null],
  ])('maps %s to %s', (pathname, section) => {
    expect(getActiveSection(pathname)).toBe(section);
    expect(isTabBarRoute(pathname)).toBe(section !== null);
  });
});

describe('MobileTabBar', () => {
  beforeEach(() => {
    navigation.pathname = '/';
    shell.friendRequestCount = 0;
  });
  afterEach(() => cleanup());

  it('shows the five tabs and marks the current one', () => {
    navigation.pathname = '/groups/abc-123';
    render(<MobileTabBar />);

    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    const links = screen.getAllByRole('link');
    expect(nav).toBeInTheDocument();
    expect(links.map((link) => link.textContent)).toEqual(['타이머', '계획', '친구', '그룹', '프로필']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/', '/plan', '/friends', '/groups', '/profile']);
    expect(screen.getByRole('link', { current: 'page' })).toHaveTextContent('그룹');
  });

  it.each(['/settings', '/terms', '/admin/users/1'])('is hidden on %s', (pathname) => {
    navigation.pathname = pathname;
    const { container } = render(<MobileTabBar />);

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('flags pending friend requests on the friends tab', () => {
    shell.friendRequestCount = 3;
    render(<MobileTabBar />);

    expect(screen.getByRole('link', { name: '친구, 받은 친구 요청 3개' })).toHaveAttribute('href', '/friends');
  });

  it('keeps its width while a select locks page scroll', () => {
    render(<MobileTabBar />);

    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toHaveClass('ui-scroll-lock-fixed');
  });

  it('reserves space so page content and the footer stay above the bar', () => {
    const { container } = render(<MobileTabBar />);

    const spacer = container.firstElementChild;
    expect(spacer).toHaveAttribute('aria-hidden', 'true');
    expect(spacer?.className).toContain('h-(--tabbar-height)');
  });
});
