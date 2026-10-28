import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: { rpc: vi.fn() },
}));

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));

import AddFriend from '../AddFriend';

const session = { user: { id: 'user-1' } };

function getInput() {
  return screen.getByRole('textbox', { name: '이메일로 찾기' });
}

describe('AddFriend', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock.rpc.mockResolvedValue({ error: null });
  });

  afterEach(() => cleanup());

  it('guides the user until a complete email is typed', () => {
    render(<AddFriend session={session as never} onFriendAdded={vi.fn()} />);

    expect(screen.getByText('친구가 가입한 이메일을 입력하면 여기에서 친구 요청을 보낼 수 있어요.')).toBeInTheDocument();
    fireEvent.change(getInput(), { target: { value: 'friend@exa' } });
    expect(screen.getByText('이메일 주소를 끝까지 입력해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '친구 요청' })).not.toBeInTheDocument();

    fireEvent.change(getInput(), { target: { value: 'friend@example.com' } });
    expect(screen.getByRole('listitem')).toHaveTextContent('friend@example.com');
    expect(screen.getByRole('button', { name: '친구 요청' })).toBeEnabled();
  });

  it('sends the request by email with the existing RPC and shows the sent state', async () => {
    const onFriendAdded = vi.fn();
    render(<AddFriend session={session as never} onFriendAdded={onFriendAdded} />);

    fireEvent.change(getInput(), { target: { value: 'friend@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '친구 요청' }));

    expect(await screen.findByRole('status')).toHaveTextContent('친구 요청을 보냈어요.');
    expect(supabaseMock.rpc).toHaveBeenCalledWith('send_friend_request', { receiver_email: 'friend@example.com' });
    expect(onFriendAdded).toHaveBeenCalledTimes(1);
    expect(getInput()).toHaveValue('');
    expect(screen.getByRole('listitem')).toHaveTextContent('friend@example.com');
    expect(screen.getByRole('button', { name: '요청 보냄' })).toBeDisabled();
  });

  it('submits from the input with Enter', async () => {
    render(<AddFriend session={session as never} onFriendAdded={vi.fn()} />);

    fireEvent.change(getInput(), { target: { value: 'friend@example.com' } });
    fireEvent.submit(getInput().closest('form')!);

    await waitFor(() => {
      expect(supabaseMock.rpc).toHaveBeenCalledWith('send_friend_request', { receiver_email: 'friend@example.com' });
    });
  });

  it.each([
    ['User not found with this email.', '이 이메일로 가입한 사람을 찾지 못했어요.'],
    ['You cannot add yourself.', '나에게는 친구 요청을 보낼 수 없어요.'],
    ['You are already friends.', '이미 친구예요.'],
    ['Friend request already sent or exists.', '이미 요청을 보냈거나 이 사람에게서 받은 요청이 있어요.'],
    ['Something unexpected', 'Something unexpected'],
  ])('explains the server error "%s"', async (serverMessage, copy) => {
    supabaseMock.rpc.mockResolvedValue({ error: { message: serverMessage } });
    const onFriendAdded = vi.fn();
    render(<AddFriend session={session as never} onFriendAdded={onFriendAdded} />);

    fireEvent.change(getInput(), { target: { value: 'friend@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '친구 요청' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(copy));
    expect(onFriendAdded).not.toHaveBeenCalled();
    // 실패하면 입력을 그대로 두어 고쳐서 다시 보낼 수 있다.
    expect(getInput()).toHaveValue('friend@example.com');
    expect(screen.getByRole('button', { name: '친구 요청' })).toBeEnabled();
  });
});
