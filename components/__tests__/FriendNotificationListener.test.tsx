import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RealtimeHandler = (payload: {
  eventType: string;
  new: Record<string, unknown>;
}) => void;

const { supabaseMock, toastMock, authState, pendingTables, channelSubscriptions } =
  vi.hoisted(() => {
    const pendingTables: Array<{ table: string; resolve: (value: unknown) => void }> = [];
    const channelSubscriptions: Array<{
      name: string;
      config: { table?: string; filter?: string };
      handler: (payload: { eventType: string; new: Record<string, unknown> }) => void;
    }> = [];

    const fromMock = vi.fn((table: string) => {
      let resolve!: (value: unknown) => void;
      const promise = new Promise((r) => {
        resolve = r;
      });
      pendingTables.push({ table, resolve });

      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in']) {
        builder[method] = vi.fn(() => builder);
      }
      builder.then = (
        onFulfilled?: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => promise.then(onFulfilled, onRejected);
      return builder;
    });

    const channelMock = vi.fn((name: string) => {
      const channel: Record<string, unknown> = { name };
      channel.on = vi.fn(
        (
          _event: string,
          config: { table?: string; filter?: string },
          handler: (payload: { eventType: string; new: Record<string, unknown> }) => void
        ) => {
          channelSubscriptions.push({ name, config, handler });
          return channel;
        }
      );
      channel.subscribe = vi.fn(() => channel);
      return channel;
    });

    return {
      pendingTables,
      channelSubscriptions,
      toastMock: vi.fn(),
      authState: {
        current: { session: null as unknown, loading: false },
      },
      supabaseMock: {
        from: fromMock,
        channel: channelMock,
        removeChannel: vi.fn(),
      },
    };
  });

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

vi.mock('react-hot-toast', () => ({
  toast: toastMock,
}));

vi.mock('@/hooks/useAuthSession', () => ({
  useAuthSession: () => authState.current,
}));

import FriendNotificationListener from '../FriendNotificationListener';

const loginAs = (id: string) => {
  authState.current = { session: { user: { id } }, loading: false };
};

const logout = () => {
  authState.current = { session: null, loading: false };
};

const resolveTable = async (index: number, data: unknown) => {
  await act(async () => {
    pendingTables[index].resolve({ data });
  });
};

const profileHandler = (): RealtimeHandler => {
  const subscription = channelSubscriptions.find(
    (entry) => entry.config.table === 'profiles'
  );
  if (!subscription) throw new Error('profiles 채널 구독이 없습니다');
  return subscription.handler;
};

describe('FriendNotificationListener 로그아웃 후 알림 잔존 방지', () => {
  beforeEach(() => {
    pendingTables.length = 0;
    channelSubscriptions.length = 0;
    toastMock.mockClear();
    supabaseMock.from.mockClear();
    supabaseMock.channel.mockClear();
    supabaseMock.removeChannel.mockClear();
    logout();
  });

  afterEach(() => {
    cleanup();
  });

  it('로그아웃 상태에서는 아무것도 조회하거나 구독하지 않는다', () => {
    render(<FriendNotificationListener />);

    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(supabaseMock.channel).not.toHaveBeenCalled();
  });

  it('로그인한 사용자 기준으로 필터링해 구독하고, 친구의 공부 시작을 알린다', async () => {
    loginAs('user-a');
    render(<FriendNotificationListener />);

    await waitFor(() => expect(pendingTables.length).toBe(1));
    expect(pendingTables[0].table).toBe('friendships');
    await resolveTable(0, [
      {
        friend_id: 'friend-1',
        nickname: '철수',
        friend_email: 'chulsoo@example.com',
        is_notification_enabled: true,
      },
    ]);

    await waitFor(() => expect(pendingTables.length).toBe(2));
    expect(pendingTables[1].table).toBe('profiles');
    await resolveTable(1, [{ id: 'friend-1', username: 'chulsoo', status: 'offline' }]);

    const friendshipSubscription = channelSubscriptions.find(
      (entry) => entry.config.table === 'friendships'
    );
    expect(friendshipSubscription?.config.filter).toBe('user_id=eq.user-a');
    expect(friendshipSubscription?.name).toBe('friend-notification-settings-user-a');

    act(() => {
      profileHandler()({
        eventType: 'UPDATE',
        new: { id: 'friend-1', username: 'chulsoo', status: 'studying' },
      });
    });

    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it('로그아웃하면 채널을 정리하고 이전 계정 친구의 상태 변경에 더 이상 알림을 띄우지 않는다', async () => {
    loginAs('user-a');
    const { rerender } = render(<FriendNotificationListener />);

    await waitFor(() => expect(pendingTables.length).toBe(1));
    await resolveTable(0, [
      {
        friend_id: 'friend-1',
        nickname: '철수',
        friend_email: 'chulsoo@example.com',
        is_notification_enabled: true,
      },
    ]);
    await waitFor(() => expect(pendingTables.length).toBe(2));
    await resolveTable(1, [{ id: 'friend-1', username: 'chulsoo', status: 'offline' }]);

    const staleHandler = profileHandler();

    logout();
    rerender(<FriendNotificationListener />);

    expect(supabaseMock.removeChannel).toHaveBeenCalledTimes(2);

    // 로그아웃 이후 이전 구독 핸들러로 이벤트가 늦게 도착해도 알림이 울리면 안 된다.
    act(() => {
      staleHandler({
        eventType: 'UPDATE',
        new: { id: 'friend-1', username: 'chulsoo', status: 'offline' },
      });
      staleHandler({
        eventType: 'UPDATE',
        new: { id: 'friend-1', username: 'chulsoo', status: 'studying' },
      });
    });

    expect(toastMock).not.toHaveBeenCalled();
  });
});
