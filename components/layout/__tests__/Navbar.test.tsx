import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
const shell = vi.hoisted(() => ({ friendRequestCount: 0 }));

vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));
vi.mock('@/components/layout/ShellProvider', () => ({
  useShell: () => ({ session: null, friendRequestCount: shell.friendRequestCount }),
}));

import Navbar from '@/components/Navbar';
import MobileTopBar from '../MobileTopBar';

const session = {
  user: { id: 'user-1', email: 'minji@example.com', user_metadata: { full_name: '민지' } },
} as unknown as Session;

// 데스크톱 헤더와 모바일 상단 바가 함께 렌더링되므로 데스크톱 헤더 안에서만 찾는다.
const desktopHeader = () => screen.getByRole('banner');
const headerNav = () => within(desktopHeader()).getByRole('navigation', { name: '주요 메뉴' });

describe('Navbar', () => {
  beforeEach(() => {
    navigation.pathname = '/';
    shell.friendRequestCount = 0;
  });
  afterEach(() => cleanup());

  it.each([
    ['/', '타이머'],
    ['/plan', '계획'],
    ['/friends', '친구'],
    ['/groups', '그룹'],
    ['/groups/abc-123', '그룹'],
  ])('marks the menu item for %s as the current page', (pathname, label) => {
    navigation.pathname = pathname;
    render(<Navbar session={session} />);

    const current = within(headerNav()).getByRole('link', { current: 'page' });
    expect(current).toHaveTextContent(label);
    expect(within(headerNav()).getAllByRole('link')).toHaveLength(4);
  });

  it.each(['/profile', '/settings', '/terms'])('leaves the menu unselected on %s', (pathname) => {
    navigation.pathname = pathname;
    render(<Navbar session={session} />);

    expect(within(headerNav()).queryByRole('link', { current: 'page' })).not.toBeInTheDocument();
  });

  it('links the initial avatar to the profile and marks it on the profile page', () => {
    navigation.pathname = '/profile';
    render(<Navbar session={session} />);

    const avatar = within(desktopHeader()).getByRole('link', { name: '내 프로필' });
    expect(avatar).toHaveAttribute('href', '/profile');
    expect(avatar).toHaveAttribute('aria-current', 'page');
    expect(avatar).toHaveTextContent('민');
  });

  it('shows a login button instead of the avatar when logged out', () => {
    const onOpenLogin = vi.fn();
    render(<Navbar session={null} onOpenLogin={onOpenLogin} />);

    expect(within(desktopHeader()).queryByRole('link', { name: '내 프로필' })).not.toBeInTheDocument();
    expect(within(desktopHeader()).queryByRole('button', { name: /알림/ })).not.toBeInTheDocument();
    // 데스크톱 헤더와 기본 모바일 상단 바에 하나씩 있다.
    const buttons = screen.getAllByRole('button', { name: '로그인' });
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => fireEvent.click(button));
    expect(onOpenLogin).toHaveBeenCalledTimes(2);
  });

  it('lists pending friend requests in the bell popover and links to the friends page', async () => {
    shell.friendRequestCount = 2;
    render(<Navbar session={session} />);

    const bell = within(desktopHeader()).getByRole('button', { name: '알림 2개' });
    expect(bell).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(bell);

    const popover = await screen.findByRole('region', { name: '알림' });
    expect(bell).toHaveAttribute('aria-expanded', 'true');
    const item = within(popover).getByRole('link', { name: '받은 친구 요청이 2개 있어요.' });
    expect(item).toHaveAttribute('href', '/friends?tab=requests');
  });

  it('opens the bell with Space without leaking keys to window shortcuts', async () => {
    // TimerApp처럼 Space를 가로채는 window 단축키
    const windowKeyDown = vi.fn((event: KeyboardEvent) => {
      if (event.code === 'Space') event.preventDefault();
    });
    window.addEventListener('keydown', windowKeyDown);
    try {
      shell.friendRequestCount = 1;
      render(<Navbar session={session} />);
      const bell = within(desktopHeader()).getByRole('button', { name: '알림 1개' });
      bell.focus();

      // 브라우저처럼: keydown이 막히지 않았을 때만 Space가 버튼을 누른다.
      if (fireEvent.keyDown(bell, { key: ' ', code: 'Space' })) {
        fireEvent.keyUp(bell, { key: ' ', code: 'Space' });
        fireEvent.click(bell);
      }

      const popover = await screen.findByRole('region', { name: '알림' });
      expect(bell).toHaveAttribute('aria-expanded', 'true');
      expect(windowKeyDown).not.toHaveBeenCalled();

      fireEvent.keyDown(within(popover).getByRole('link'), { key: ' ', code: 'Space' });
      expect(windowKeyDown).not.toHaveBeenCalled();

      // Escape는 여전히 팝오버를 닫고 종으로 포커스를 돌려준다.
      fireEvent.keyDown(popover, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('region', { name: '알림' })).not.toBeInTheDocument());
      expect(bell).toHaveAttribute('aria-expanded', 'false');
      expect(bell).toHaveFocus();
    } finally {
      window.removeEventListener('keydown', windowKeyDown);
    }
  });

  it('shows a short empty state when there are no notifications', async () => {
    render(<Navbar session={session} />);

    fireEvent.click(within(desktopHeader()).getByRole('button', { name: '알림' }));

    const popover = await screen.findByRole('region', { name: '알림' });
    expect(popover).toHaveTextContent('새 알림이 없어요.');
    expect(within(popover).queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders the default mobile top bar, a custom one, or none', () => {
    const { rerender } = render(<Navbar session={session} />);
    expect(screen.getAllByRole('link', { name: 'Fomopomo' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '알림' })).toHaveLength(2);

    rerender(<Navbar session={session} mobileTopBar={<MobileTopBar start={<h1>친구</h1>} />} />);
    expect(screen.getByRole('heading', { name: '친구' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Fomopomo' })).toHaveLength(1);

    rerender(<Navbar session={session} mobileTopBar={null} />);
    expect(screen.queryByRole('heading', { name: '친구' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '알림' })).toHaveLength(1);
  });
});
