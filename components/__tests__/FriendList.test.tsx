import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock, toastMock } = vi.hoisted(() => {
  const orderMock = vi.fn();
  const eqMock = vi.fn(() => ({ order: orderMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  const rpcMock = vi.fn();
  const subscribeMock = vi.fn((callback?: (status: string) => void) => {
    callback?.('SUBSCRIBED');
    return {};
  });
  const onMock = vi.fn(function on() {
    return { on: onMock, subscribe: subscribeMock };
  });
  const channelMock = vi.fn(() => ({ on: onMock, subscribe: subscribeMock }));

  return {
    toastMock: {
      success: vi.fn(),
      error: vi.fn(),
    },
    supabaseMock: {
      from: fromMock,
      rpc: rpcMock,
      channel: channelMock,
      removeChannel: vi.fn(),
      __mocks: {
        orderMock,
        eqMock,
        selectMock,
        fromMock,
        rpcMock,
        channelMock,
        onMock,
        subscribeMock,
      },
    },
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

vi.mock('react-hot-toast', () => ({
  toast: toastMock,
}));

vi.mock('../friends/FriendStatusBadge', () => ({
  FriendStatusBadge: ({ status }: { status: string | null }) => (
    <div data-testid="friend-status">{status ?? 'none'}</div>
  ),
}));

vi.mock('../MemberReportModal', () => ({
  default: () => null,
}));

import FriendList from '../friends/FriendList';

const session = {
  user: {
    id: 'user-1',
  },
};

function setupFriendshipResponse(friend: unknown) {
  const {
    orderMock,
    rpcMock,
    fromMock,
    channelMock,
    onMock,
    subscribeMock,
  } = supabaseMock.__mocks;

  orderMock.mockResolvedValue({
    data: [
      {
        id: 'friendship-1',
        friend_email: 'friend@example.com',
        friend_id: 'friend-1',
        nickname: 'Buddy',
        created_at: '2026-03-18T00:00:00.000Z',
        is_notification_enabled: true,
        friend,
      },
    ],
    error: null,
  });

  rpcMock.mockResolvedValue({
    data: [],
    error: null,
  });

  fromMock.mockClear();
  channelMock.mockClear();
  onMock.mockClear();
  subscribeMock.mockClear();
}

describe('FriendList', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders friends when the embedded friend payload is an object', async () => {
    setupFriendshipResponse({
      status: 'online',
      current_task: 'Reading',
      last_active_at: '2026-03-18T00:00:00.000Z',
      study_start_time: null,
      total_stopwatch_time: 0,
    });

    render(<FriendList session={session as never} refreshTrigger={0} />);

    await waitFor(() => {
      expect(screen.getByText('Buddy')).toBeInTheDocument();
    });

    expect(screen.getByText(/friend@example\.com/)).toBeInTheDocument();
    expect(screen.getByTestId('friend-status')).toHaveTextContent('online');
  });

  it('오늘 공부시간을 공부일(로컬 05:00) 절대 범위로 조회한다', async () => {
    setupFriendshipResponse({
      status: 'online',
      current_task: null,
      last_active_at: '2026-03-18T00:00:00.000Z',
      study_start_time: null,
      total_stopwatch_time: 0,
    });

    render(<FriendList session={session as never} refreshTrigger={0} />);

    const { rpcMock } = supabaseMock.__mocks;
    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalled();
    });

    const [fnName, params] = rpcMock.mock.calls[0] as [
      string,
      { p_user_id: string; p_start_time: string; p_end_time: string; p_date?: string },
    ];
    expect(fnName).toBe('get_friends_study_time');
    expect(params.p_user_id).toBe('user-1');
    // 날짜 문자열(p_date)이 아니라 timestamptz 절대 범위를 전달한다.
    expect(params.p_date).toBeUndefined();

    const start = new Date(params.p_start_time);
    const end = new Date(params.p_end_time);
    expect(params.p_start_time).toBe(start.toISOString());
    expect(params.p_end_time).toBe(end.toISOString());
    // 로컬 05:00 경계에서 시작하는 24시간(-1ms) 범위다.
    expect(start.getHours()).toBe(5);
    expect(start.getMinutes()).toBe(0);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('preserves array-shaped embedded friend payloads', async () => {
    setupFriendshipResponse([
      {
        status: 'paused',
        current_task: 'Review',
        last_active_at: '2026-03-18T00:00:00.000Z',
        study_start_time: null,
        total_stopwatch_time: 120,
      },
    ]);

    render(<FriendList session={session as never} refreshTrigger={0} />);

    await waitFor(() => {
      expect(screen.getByText('Buddy')).toBeInTheDocument();
    });

    expect(screen.getByTestId('friend-status')).toHaveTextContent('paused');
  });
});
