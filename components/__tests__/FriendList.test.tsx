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
