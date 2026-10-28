import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock, toastMock } = vi.hoisted(() => {
  const orderMock = vi.fn();
  const eqStatusMock = vi.fn(() => ({ order: orderMock }));
  const eqReceiverMock = vi.fn(() => ({ eq: eqStatusMock }));
  const selectMock = vi.fn(() => ({ eq: eqReceiverMock }));
  return {
    toastMock: { success: vi.fn(), error: vi.fn() },
    supabaseMock: {
      from: vi.fn(() => ({ select: selectMock })),
      rpc: vi.fn(),
      __mocks: { orderMock, eqReceiverMock, eqStatusMock },
    },
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('react-hot-toast', () => ({ toast: toastMock }));

import FriendRequestList from '../FriendRequestList';

const session = { user: { id: 'user-1' } };
const thisYear = new Date().getFullYear();

const pending = [
  { id: 'req-1', sender_email: 'sua@example.com', created_at: new Date(thisYear, 9, 28, 12).toISOString() },
  { id: 'req-2', sender_email: 'old@example.com', created_at: new Date(thisYear - 1, 0, 3, 12).toISOString() },
];

describe('FriendRequestList', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    supabaseMock.__mocks.orderMock.mockResolvedValue({ data: pending, error: null });
    supabaseMock.rpc.mockResolvedValue({ error: null });
  });

  afterEach(() => cleanup());

  it('lists pending requests for the signed-in receiver and reports the count', async () => {
    const onCountChange = vi.fn();
    render(<FriendRequestList session={session as never} refreshTrigger={0} onUpdate={vi.fn()} onCountChange={onCountChange} />);

    expect(screen.getByText('받은 요청을 불러오는 중이에요.')).toBeInTheDocument();
    expect(await screen.findByText('sua@example.com')).toBeInTheDocument();
    expect(screen.getByText('10월 28일에 받은 요청')).toBeInTheDocument();
    expect(screen.getByText(`${thisYear - 1}년 1월 3일에 받은 요청`)).toBeInTheDocument();
    expect(supabaseMock.from).toHaveBeenCalledWith('friend_requests');
    expect(supabaseMock.__mocks.eqReceiverMock).toHaveBeenCalledWith('receiver_id', 'user-1');
    expect(supabaseMock.__mocks.eqStatusMock).toHaveBeenCalledWith('status', 'pending');
    expect(onCountChange).toHaveBeenLastCalledWith(2);
  });

  it('shows the empty copy when there are no requests', async () => {
    supabaseMock.__mocks.orderMock.mockResolvedValue({ data: [], error: null });
    render(<FriendRequestList session={session as never} refreshTrigger={0} onUpdate={vi.fn()} />);

    expect(await screen.findByText('받은 요청이 없어요. 찾기에서 친구를 추가해 보세요.')).toBeInTheDocument();
  });

  it('accepts a request through the existing RPC and refreshes', async () => {
    const onUpdate = vi.fn();
    render(<FriendRequestList session={session as never} refreshTrigger={0} onUpdate={onUpdate} />);
    await screen.findByText('sua@example.com');
    supabaseMock.__mocks.orderMock.mockResolvedValue({ data: [pending[1]], error: null });

    fireEvent.click(screen.getByRole('button', { name: 'sua@example.com 친구 요청 수락' }));

    await waitFor(() => expect(screen.queryByText('sua@example.com')).not.toBeInTheDocument());
    expect(supabaseMock.rpc).toHaveBeenCalledWith('accept_friend_request', { request_id: 'req-1' });
    expect(onUpdate).toHaveBeenCalled();
  });

  it('rejects a request through the existing RPC', async () => {
    const onUpdate = vi.fn();
    render(<FriendRequestList session={session as never} refreshTrigger={0} onUpdate={onUpdate} />);
    await screen.findByText('old@example.com');

    fireEvent.click(screen.getByRole('button', { name: 'old@example.com 친구 요청 거절' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(supabaseMock.rpc).toHaveBeenCalledWith('reject_friend_request', { request_id: 'req-2' });
  });

  it('keeps the request and tells the user when accepting fails', async () => {
    supabaseMock.rpc.mockResolvedValue({ error: { message: 'boom' } });
    const onUpdate = vi.fn();
    render(<FriendRequestList session={session as never} refreshTrigger={0} onUpdate={onUpdate} />);
    await screen.findByText('sua@example.com');

    fireEvent.click(screen.getByRole('button', { name: 'sua@example.com 친구 요청 수락' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('친구 요청을 수락하지 못했어요.'));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('sua@example.com')).toBeInTheDocument();
  });

  it('lets a handled request fade out in place, out of reach, while the list already moved on', async () => {
    // happy-dom은 CSS 애니메이션을 돌리지 않으므로 사라지는 줄에서 퇴장 애니메이션이 도는 것처럼 꾸민다.
    const finishers: Array<() => void> = [];
    Object.defineProperty(Element.prototype, 'getAnimations', {
      configurable: true,
      value(this: Element) {
        if (!this.matches('li[data-state="closed"]')) return [];
        return [{
          playState: 'running',
          currentTime: 0,
          finished: new Promise<void>((resolve) => { finishers.push(resolve); }),
          effect: {
            getTiming: () => ({ iterations: 1, duration: 140, delay: 0 }),
            getComputedTiming: () => ({ endTime: 140 }),
          },
        }];
      },
    });
    try {
      const onCountChange = vi.fn();
      render(<FriendRequestList session={session as never} refreshTrigger={0} onUpdate={vi.fn()} onCountChange={onCountChange} />);
      await screen.findByText('sua@example.com');
      supabaseMock.__mocks.orderMock.mockResolvedValue({ data: [pending[1]], error: null });

      fireEvent.click(screen.getByRole('button', { name: 'sua@example.com 친구 요청 수락' }));
      await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(1));

      // 다시 불러온 목록에는 없지만, 그 줄은 원래 자리(첫 줄)에서 사라지는 중이다.
      const rows = screen.getAllByRole('listitem', { hidden: true });
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining('sua@example.com'),
        expect.stringContaining('old@example.com'),
      ]);
      expect(rows[0]).toHaveAttribute('data-state', 'closed');
      expect(rows[0]).toHaveAttribute('inert');
      expect(rows[0]).toHaveClass('animate-fade-out', 'pointer-events-none');
      rows[0].querySelectorAll('button').forEach((button) => expect(button).toBeDisabled());
      expect(rows[1]).not.toHaveAttribute('data-state');
      expect(screen.getByRole('button', { name: 'old@example.com 친구 요청 수락' })).toBeEnabled();

      await act(async () => {
        finishers.splice(0).forEach((finish) => finish());
      });
      expect(screen.queryByText('sua@example.com')).not.toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    } finally {
      delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
    }
  });

  it('fades the empty copy in only after the user handled the last request', async () => {
    supabaseMock.__mocks.orderMock.mockResolvedValue({ data: [pending[0]], error: null });
    render(<FriendRequestList session={session as never} refreshTrigger={0} onUpdate={vi.fn()} />);
    await screen.findByText('sua@example.com');
    supabaseMock.__mocks.orderMock.mockResolvedValue({ data: [], error: null });

    fireEvent.click(screen.getByRole('button', { name: 'sua@example.com 친구 요청 거절' }));

    const empty = await screen.findByText('받은 요청이 없어요. 찾기에서 친구를 추가해 보세요.');
    expect(empty).toHaveClass('animate-fade-in');
    // 한 번 돌면 떼어, 탭을 다시 열어도 되풀이하지 않는다.
    fireEvent.animationEnd(empty);
    expect(empty).not.toHaveClass('animate-fade-in');
  });

  it('shows the empty copy on load without motion', async () => {
    supabaseMock.__mocks.orderMock.mockResolvedValue({ data: [], error: null });
    render(<FriendRequestList session={session as never} refreshTrigger={0} onUpdate={vi.fn()} />);

    expect(await screen.findByText('받은 요청이 없어요. 찾기에서 친구를 추가해 보세요.')).not.toHaveClass('animate-fade-in');
  });

  it('refetches when the shell reports a new incoming request', async () => {
    const { rerender } = render(
      <FriendRequestList session={session as never} refreshTrigger={0} onUpdate={vi.fn()} incomingCount={2} />
    );
    await screen.findByText('sua@example.com');
    const calls = supabaseMock.__mocks.orderMock.mock.calls.length;
    supabaseMock.__mocks.orderMock.mockResolvedValue({
      data: [{ id: 'req-3', sender_email: 'new@example.com', created_at: new Date().toISOString() }, ...pending],
      error: null,
    });

    rerender(<FriendRequestList session={session as never} refreshTrigger={0} onUpdate={vi.fn()} incomingCount={3} />);

    expect(await screen.findByText('new@example.com')).toBeInTheDocument();
    expect(supabaseMock.__mocks.orderMock.mock.calls.length).toBeGreaterThan(calls);
  });
});
