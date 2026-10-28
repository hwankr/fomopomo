import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 친구 순위의 리포트 창이 실제 부모(FriendList) 안에서 닫힐 때 공통 퇴장 애니메이션을 하는지 본다.
// (FriendList.test.tsx는 리포트 창을 흉내 내므로 여기서는 실제 MemberReportModal을 쓴다.)
const { supabaseMock, tables } = vi.hoisted(() => {
  const tables: Record<string, unknown> = {};
  // 어떤 체인이든 await하면 테이블 값으로 끝난다. maybeSingle은 내 상태(profiles) 한 줄.
  const query = (table: string) => {
    const result = () => Promise.resolve({ data: tables[table] ?? [], error: null });
    const chain: Record<string, unknown> = {};
    ['select', 'eq', 'gte', 'lte', 'order', 'update'].forEach((method) => {
      chain[method] = vi.fn(() => chain);
    });
    chain.maybeSingle = vi.fn(result);
    chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => result().then(resolve, reject);
    return chain;
  };
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);
  return {
    tables,
    supabaseMock: {
      from: vi.fn(query),
      rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import FriendList from '../friends/FriendList';

const session = { user: { id: 'user-1', email: 'me@example.com', user_metadata: { nickname: '민지' } } };
const friendProfile = { status: 'online', current_task: null, last_active_at: null, study_start_time: null, total_stopwatch_time: 0 };

const running: Array<() => void> = [];

// happy-dom은 CSS 애니메이션을 돌리지 않는다. 닫히는 덮개에서 퇴장 애니메이션이 도는 것처럼 꾸민다.
function mockExitAnimations() {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value(this: Element, options?: { subtree?: boolean }) {
      const elements = [this, ...(options?.subtree ? Array.from(this.querySelectorAll('*')) : [])];
      return elements
        .filter((element) => element.matches('.ui-dialog-overlay[data-state="closed"]'))
        .map(() => {
          let finish!: () => void;
          const finished = new Promise<void>((resolve) => { finish = resolve; });
          running.push(finish);
          return {
            playState: 'running',
            currentTime: 0,
            finished,
            effect: {
              getTiming: () => ({ iterations: 1, duration: 140, delay: 0 }),
              getComputedTiming: () => ({ endTime: 140 }),
            },
          };
        });
    },
  });
}

describe('FriendList report dialog', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    running.length = 0;
    tables.friendships = [{
      id: 'friendship-1',
      friend_email: 'friend@example.com',
      friend_id: 'friend-1',
      nickname: 'Buddy',
      created_at: '2026-03-18T00:00:00.000Z',
      is_notification_enabled: true,
      friend: friendProfile,
    }];
    tables.profiles = { ...friendProfile, status: 'offline' };
    tables.study_sessions = [];
  });

  afterEach(() => {
    cleanup();
    delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
  });

  it('closes the report with data-state="closed" and unmounts it only after the exit animation', async () => {
    mockExitAnimations();
    render(<FriendList session={session as never} refreshTrigger={0} />);

    fireEvent.click(await screen.findByRole('button', { name: /^순위 \d+.*Buddy/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Buddy님의 리포트' });
    await within(dialog).findByText('오늘 기록된 작업이 없어요.');

    fireEvent.click(within(dialog).getByRole('button', { name: '리포트 닫기' }));

    const overlay = document.querySelector('.ui-dialog-overlay[data-state="closed"]');
    expect(overlay).not.toBeNull();
    expect(overlay).toContainElement(dialog);
    expect(dialog).toHaveAttribute('data-state', 'closed');
    expect(overlay).toHaveAttribute('inert');
    expect(dialog).toHaveTextContent('Buddy님의 리포트');

    await act(async () => {
      running.splice(0).forEach((finish) => finish());
    });
    expect(document.querySelector('.ui-dialog-overlay')).toBeNull();
  });

  it('opens a fresh report for my own row after closing a friend’s', async () => {
    render(<FriendList session={session as never} refreshTrigger={0} />);

    fireEvent.click(await screen.findByRole('button', { name: /^순위 \d+.*Buddy/ }));
    const first = await screen.findByRole('dialog', { name: 'Buddy님의 리포트' });
    await within(first).findByText('오늘 기록된 작업이 없어요.');
    fireEvent.click(within(first).getByRole('button', { name: '리포트 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    tables.study_sessions = [{ duration: 1500, task: '영어 단어' }];
    fireEvent.click(screen.getByRole('button', { name: /^순위 \d+.*민지/ }));
    const mine = screen.getByRole('dialog', { name: '민지님의 리포트' });
    expect(within(mine).getByRole('status')).toHaveTextContent('불러오는 중이에요…');
    expect(await within(mine).findByText('영어 단어')).toBeInTheDocument();
  });
});
