import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
