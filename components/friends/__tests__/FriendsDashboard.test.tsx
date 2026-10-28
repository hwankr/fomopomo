import { useEffect } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shell = vi.hoisted(() => ({ friendRequestCount: 1 }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/friends',
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('@/components/layout/ShellProvider', () => ({
  useShell: () => ({ session: null, friendRequestCount: shell.friendRequestCount }),
}));

vi.mock('@/components/layout/NotificationBell', () => ({
  default: () => <button type="button">알림</button>,
}));

// 헤더는 모바일 상단 바 슬롯만 그려 확인한다.
vi.mock('../../Navbar', () => ({
  default: ({ mobileTopBar }: { mobileTopBar?: React.ReactNode }) => <div data-testid="navbar">{mobileTopBar}</div>,
}));

vi.mock('../FriendList', () => {
  function FriendListStub({ refreshTrigger, onSummaryChange, active }: {
    refreshTrigger: number;
    onSummaryChange?: (summary: { friendCount: number; studyingCount: number } | null) => void;
    active?: boolean;
  }) {
    useEffect(() => {
      onSummaryChange?.({ friendCount: 6, studyingCount: 2 });
    }, [onSummaryChange]);
    return <p data-active={String(active)}>friend list (refresh {refreshTrigger})</p>;
  }
  return { default: FriendListStub };
});

vi.mock('../FriendRequestList', () => {
  function FriendRequestListStub({ incomingCount, onCountChange, active }: {
    incomingCount?: number;
    onCountChange?: (count: number) => void;
    active?: boolean;
  }) {
    useEffect(() => {
      onCountChange?.(2);
    }, [onCountChange]);
    return <p data-active={String(active)}>request list (incoming {incomingCount})</p>;
  }
  return { default: FriendRequestListStub };
});

vi.mock('../AddFriend', () => ({
  default: ({ onFriendAdded, active }: { onFriendAdded: () => void; active?: boolean }) => (
    <button type="button" data-active={String(active)} onClick={onFriendAdded}>send request</button>
  ),
}));

import FriendsDashboard from '../FriendsDashboard';

const session = { user: { id: 'user-1' } };

function getTab(name: RegExp) {
  return screen.getByRole('tab', { name });
}

describe('FriendsDashboard', () => {
  beforeEach(() => {
    cleanup();
    shell.friendRequestCount = 1;
    window.history.replaceState(null, '', '/friends');
  });

  afterEach(() => cleanup());

  it('shows the heading, studying summary and pill tabs with counts', () => {
    render(<FriendsDashboard session={session as never} />);

    expect(screen.getAllByRole('heading', { level: 1, name: '친구' })).toHaveLength(2);
    expect(screen.getByText('지금 2명이 공부하고 있어요')).toBeInTheDocument();
    // 모바일 상단 바의 짧은 부제
    expect(within(screen.getByTestId('navbar')).getByText('지금 2명 공부 중')).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['친구 6', '요청 2', '찾기']);
    expect(getTab(/^친구/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: '친구 6' })).toBeVisible();
    expect(screen.getByText(/request list/).closest('[role="tabpanel"]')).not.toBeVisible();
  });

  it('switches tabs on click and mirrors the tab in the address', () => {
    render(<FriendsDashboard session={session as never} />);

    fireEvent.click(getTab(/^요청/));
    expect(getTab(/^요청/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: '요청 2' })).toHaveTextContent('request list');
    expect(window.location.search).toBe('?tab=requests');

    fireEvent.click(getTab(/^친구/));
    expect(getTab(/^친구/)).toHaveAttribute('aria-selected', 'true');
    expect(window.location.pathname + window.location.search).toBe('/friends');
  });

  it('opens the tab named in the address', () => {
    window.history.replaceState(null, '', '/friends?tab=search');
    render(<FriendsDashboard session={session as never} />);

    expect(getTab(/^찾기/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: '찾기' })).toBeVisible();
  });

  it('fades in only the panel the user switched to, never the one shown on load', () => {
    window.history.replaceState(null, '', '/friends?tab=requests');
    render(<FriendsDashboard session={session as never} />);

    const panel = (name: RegExp) => screen.getByText(name).closest('[role="tabpanel"]');
    expect(panel(/request list/)).not.toHaveClass('animate-fade-in');

    fireEvent.click(getTab(/^친구/));
    expect(panel(/friend list/)).toHaveClass('animate-fade-in');
    expect(panel(/request list/)).not.toHaveClass('animate-fade-in');

    // 키보드로 바꿔도 같다. 보이는 탭을 다시 누르면 아무것도 바뀌지 않는다.
    fireEvent.keyDown(getTab(/^친구/), { key: 'ArrowRight' });
    expect(panel(/request list/)).toHaveClass('animate-fade-in');
    expect(panel(/friend list/)).not.toHaveClass('animate-fade-in');
    fireEvent.click(getTab(/^요청/));
    expect(panel(/request list/)).toHaveClass('animate-fade-in');
    expect(panel(/friend list/)).not.toHaveClass('animate-fade-in');
  });

  it('tells each panel whether it is shown', () => {
    window.history.replaceState(null, '', '/friends?tab=requests');
    render(<FriendsDashboard session={session as never} />);
    // 숨은 패널은 남은 피드백 표시를 떼고, 숨은 친구 패널에 생긴 새 친구 줄은 패널이 보일 때 한 번 떠오른다.
    const shown = () => [
      screen.getByText(/friend list/),
      screen.getByText(/request list/),
      screen.getByRole('button', { name: 'send request', hidden: true }),
    ].map((panel) => panel.getAttribute('data-active'));

    expect(shown()).toEqual(['false', 'true', 'false']);
    fireEvent.click(getTab(/^친구/));
    expect(shown()).toEqual(['true', 'false', 'false']);
    fireEvent.click(getTab(/^찾기/));
    expect(shown()).toEqual(['false', 'false', 'true']);
  });

  it('moves between tabs with arrow, Home and End keys', () => {
    render(<FriendsDashboard session={session as never} />);

    fireEvent.keyDown(getTab(/^친구/), { key: 'ArrowRight' });
    expect(getTab(/^요청/)).toHaveAttribute('aria-selected', 'true');
    expect(getTab(/^요청/)).toHaveFocus();
    expect(getTab(/^친구/)).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(getTab(/^요청/), { key: 'End' });
    expect(getTab(/^찾기/)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(getTab(/^찾기/), { key: 'ArrowRight' });
    expect(getTab(/^친구/)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(getTab(/^친구/), { key: 'ArrowLeft' });
    expect(getTab(/^찾기/)).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(getTab(/^찾기/), { key: 'Home' });
    expect(getTab(/^친구/)).toHaveAttribute('aria-selected', 'true');
  });

  it('passes the live incoming count to the request list and refreshes lists after sending', () => {
    shell.friendRequestCount = 3;
    render(<FriendsDashboard session={session as never} />);

    expect(screen.getByText('request list (incoming 3)')).toBeInTheDocument();
    expect(screen.getByText('friend list (refresh 0)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'send request', hidden: true }));
    expect(screen.getByText('friend list (refresh 1)')).toBeInTheDocument();
  });

  it('asks guests to log in with the login flow instead of showing tabs', () => {
    const onOpenLogin = vi.fn();
    render(<FriendsDashboard session={null} onOpenLogin={onOpenLogin} />);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByText(/friend list/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '로그인하고 친구와 함께 공부해요' })).toBeInTheDocument();

    const loginButtons = screen.getAllByRole('button', { name: '로그인' });
    expect(loginButtons).toHaveLength(2);
    loginButtons.forEach((button) => fireEvent.click(button));
    expect(onOpenLogin).toHaveBeenCalledTimes(2);
  });
});
