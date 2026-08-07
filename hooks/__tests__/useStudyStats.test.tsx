import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';

const { supabaseMock, pendingQueries } = vi.hoisted(() => {
  const pendingQueries: Array<{ resolve: (value: unknown) => void }> = [];

  const fromMock = vi.fn(() => {
    let resolve!: (value: unknown) => void;
    const promise = new Promise((r) => {
      resolve = r;
    });
    pendingQueries.push({ resolve });

    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'limit', 'in']) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => promise.then(onFulfilled, onRejected);
    return builder;
  });

  return {
    pendingQueries,
    supabaseMock: {
      from: fromMock,
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
    },
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

import { useStudyStats } from '@/hooks/useStudyStats';

function StatsProbe({ userId }: { userId: string | null }) {
  const { totalFocusTime, heatmapData, chartData, fetchStats } = useStudyStats(userId);

  useEffect(() => {
    if (userId) {
      fetchStats('year', new Date(2026, 0, 1), userId);
    }
  }, [userId, fetchStats]);

  return (
    <div>
      <div data-testid="total">{totalFocusTime}</div>
      <div data-testid="heatmap-count">{heatmapData.length}</div>
      <div data-testid="chart-seconds">
        {chartData.reduce((acc, bucket) => acc + bucket.seconds, 0)}
      </div>
    </div>
  );
}

const resolveQuery = async (index: number, result: unknown) => {
  await act(async () => {
    pendingQueries[index].resolve(result);
  });
};

// fetchStats는 period → all → today 순서로 3개의 쿼리를 순차 실행한다.
const resolveFetchQueries = async (
  startIndex: number,
  { duration, createdAt }: { duration: number; createdAt: string }
) => {
  await waitFor(() => expect(pendingQueries.length).toBe(startIndex + 1));
  await resolveQuery(startIndex, {
    data: [{ duration, created_at: createdAt, task: '수학' }],
  });
  await waitFor(() => expect(pendingQueries.length).toBe(startIndex + 2));
  await resolveQuery(startIndex + 1, {
    data: [{ duration, created_at: createdAt }],
  });
  await waitFor(() => expect(pendingQueries.length).toBe(startIndex + 3));
  await resolveQuery(startIndex + 2, { data: [] });
};

describe('useStudyStats 로그아웃/계정 전환 잔존 데이터 방지', () => {
  beforeEach(() => {
    pendingQueries.length = 0;
    supabaseMock.from.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('계정이 바뀌면 이전 계정의 통계·히트맵을 동기적으로 초기화한다', async () => {
    const { rerender } = render(<StatsProbe userId="user-a" />);

    await resolveFetchQueries(0, {
      duration: 5400,
      createdAt: '2026-03-02T10:00:00.000Z',
    });

    await waitFor(() => {
      expect(screen.getByTestId('total').textContent).toBe('5400');
      expect(screen.getByTestId('heatmap-count').textContent).toBe('1');
    });

    rerender(<StatsProbe userId="user-b" />);

    // 새 계정의 fetch가 끝나기 전에도 이전 계정 데이터가 보이면 안 된다.
    expect(screen.getByTestId('total').textContent).toBe('0');
    expect(screen.getByTestId('heatmap-count').textContent).toBe('0');
    expect(screen.getByTestId('chart-seconds').textContent).toBe('0');
  });

  it('계정 전환 후 도착한 이전 계정의 in-flight 응답은 폐기한다', async () => {
    const { rerender } = render(<StatsProbe userId="user-a" />);

    // user-a의 첫 쿼리(period)가 시작됐지만 아직 응답 전이다.
    await waitFor(() => expect(pendingQueries.length).toBe(1));

    rerender(<StatsProbe userId="user-b" />);

    // user-b의 fetch가 시작되어 새 쿼리가 등록된다.
    await waitFor(() => expect(pendingQueries.length).toBe(2));

    // 늦게 도착한 user-a의 응답은 무시되어야 하며 후속 쿼리도 발행되지 않아야 한다.
    await resolveQuery(0, {
      data: [{ duration: 9999, created_at: '2026-03-02T10:00:00.000Z', task: '국어' }],
    });
    expect(screen.getByTestId('total').textContent).toBe('0');
    expect(pendingQueries.length).toBe(2);

    // user-b의 응답은 정상 반영된다.
    await resolveQuery(1, {
      data: [{ duration: 1200, created_at: '2026-05-01T10:00:00.000Z', task: '영어' }],
    });
    await waitFor(() => expect(pendingQueries.length).toBe(3));
    await resolveQuery(2, {
      data: [{ duration: 1200, created_at: '2026-05-01T10:00:00.000Z' }],
    });
    await waitFor(() => expect(pendingQueries.length).toBe(4));
    await resolveQuery(3, { data: [] });

    await waitFor(() => {
      expect(screen.getByTestId('total').textContent).toBe('1200');
    });
    expect(screen.getByTestId('heatmap-count').textContent).toBe('1');
  });

  it('로그아웃하면 통계를 비우고 추가 조회를 하지 않는다', async () => {
    const { rerender } = render(<StatsProbe userId="user-a" />);

    await resolveFetchQueries(0, {
      duration: 3600,
      createdAt: '2026-03-02T10:00:00.000Z',
    });
    await waitFor(() => {
      expect(screen.getByTestId('total').textContent).toBe('3600');
    });

    const queriesBeforeLogout = pendingQueries.length;
    rerender(<StatsProbe userId={null} />);

    expect(screen.getByTestId('total').textContent).toBe('0');
    expect(screen.getByTestId('heatmap-count').textContent).toBe('0');
    expect(screen.getByTestId('chart-seconds').textContent).toBe('0');
    expect(pendingQueries.length).toBe(queriesBeforeLogout);
  });
});
