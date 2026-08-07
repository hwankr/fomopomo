import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

const { supabaseMock, pendingCounts } = vi.hoisted(() => {
  const pendingCounts: Array<{ resolve: (value: unknown) => void }> = [];

  const fromMock = vi.fn(() => {
    let resolve!: (value: unknown) => void;
    const promise = new Promise((r) => {
      resolve = r;
    });
    pendingCounts.push({ resolve });

    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq']) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => promise.then(onFulfilled, onRejected);
    return builder;
  });

  const subscribeMock = vi.fn(() => ({ id: 'channel' }));
  const onMock = vi.fn(() => ({ subscribe: subscribeMock }));
  const channelMock = vi.fn(() => ({ on: onMock }));

  return {
    pendingCounts,
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

import { useFriendRequestCount } from '@/hooks/useFriendRequestCount';

const sessionFor = (id: string) =>
  ({ user: { id } } as unknown as Session);

function CountProbe({ session }: { session: Session | null }) {
  const count = useFriendRequestCount(session);
  return <div data-testid="count">{count}</div>;
}

const resolveCount = async (index: number, count: number) => {
  await act(async () => {
    pendingCounts[index].resolve({ count, error: null });
  });
};

describe('useFriendRequestCount 로그아웃/계정 전환 잔존 카운트 방지', () => {
  beforeEach(() => {
    pendingCounts.length = 0;
    supabaseMock.from.mockClear();
    supabaseMock.removeChannel.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('계정이 바뀌면 카운트를 동기적으로 0으로 리셋한 뒤 새 계정 값을 반영한다', async () => {
    const { rerender } = render(<CountProbe session={sessionFor('user-a')} />);

    await waitFor(() => expect(pendingCounts.length).toBe(1));
    await resolveCount(0, 5);
    expect(screen.getByTestId('count').textContent).toBe('5');

    rerender(<CountProbe session={sessionFor('user-b')} />);

    // 새 계정의 조회가 끝나기 전에는 이전 계정의 카운트가 보이면 안 된다.
    expect(screen.getByTestId('count').textContent).toBe('0');

    await waitFor(() => expect(pendingCounts.length).toBe(2));
    await resolveCount(1, 2);
    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('계정 전환 후 도착한 이전 계정의 in-flight 응답은 폐기한다', async () => {
    const { rerender } = render(<CountProbe session={sessionFor('user-a')} />);

    await waitFor(() => expect(pendingCounts.length).toBe(1));

    rerender(<CountProbe session={sessionFor('user-b')} />);
    await waitFor(() => expect(pendingCounts.length).toBe(2));

    // 늦게 도착한 user-a의 응답은 무시된다.
    await resolveCount(0, 9);
    expect(screen.getByTestId('count').textContent).toBe('0');

    await resolveCount(1, 3);
    expect(screen.getByTestId('count').textContent).toBe('3');
  });

  it('로그아웃하면 0을 반환하고 채널을 정리한다', async () => {
    const { rerender } = render(<CountProbe session={sessionFor('user-a')} />);

    await waitFor(() => expect(pendingCounts.length).toBe(1));
    await resolveCount(0, 4);
    expect(screen.getByTestId('count').textContent).toBe('4');

    rerender(<CountProbe session={null} />);

    expect(screen.getByTestId('count').textContent).toBe('0');
    await waitFor(() => expect(supabaseMock.removeChannel).toHaveBeenCalledTimes(1));
    // 로그아웃 상태에서는 새 조회를 시작하지 않는다.
    expect(pendingCounts.length).toBe(1);
  });
});
