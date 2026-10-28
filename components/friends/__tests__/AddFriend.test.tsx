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

  it('raises the result row once each time a complete email is typed', () => {
    render(<AddFriend session={session as never} onFriendAdded={vi.fn()} />);

    fireEvent.change(getInput(), { target: { value: 'friend@example.com' } });
    const row = screen.getByRole('listitem');
    expect(row).toHaveClass('animate-fade-up');

    // 계속 입력해도 같은 줄이라 다시 돌지 않고, 한 번 돈 뒤에는 떼어 탭을 다시 열어도 되풀이하지 않는다.
    fireEvent.change(getInput(), { target: { value: 'friend@example.co' } });
    expect(screen.getByRole('listitem')).toBe(row);
    fireEvent.animationEnd(row);
    expect(row).not.toHaveClass('animate-fade-up');

    // 주소가 다시 미완성이 되면 줄이 빠지고, 다시 완성되면 새 줄이 한 번 떠오른다.
    fireEvent.change(getInput(), { target: { value: 'friend@' } });
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    fireEvent.change(getInput(), { target: { value: 'friend@example.com' } });
    expect(screen.getByRole('listitem')).toHaveClass('animate-fade-up');
  });

  it('pops a check into the sent button and fades the result message in, once', async () => {
    render(<AddFriend session={session as never} onFriendAdded={vi.fn()} />);
    const status = screen.getByRole('status');
    expect(status).not.toHaveClass('animate-fade-in');

    fireEvent.change(getInput(), { target: { value: 'friend@example.com' } });
    const requestButton = screen.getByRole('button', { name: '친구 요청' });
    expect(requestButton.querySelector('svg')).toBeNull();
    fireEvent.click(requestButton);

    const sent = await screen.findByRole('button', { name: '요청 보냄' });
    // 같은 버튼이 보냄 상태로 바뀌어(색이 바뀐다) 체크가 한 번 나타난다.
    expect(sent).toBe(requestButton);
    const check = sent.querySelector('svg')!;
    expect(check).toHaveAttribute('aria-hidden', 'true');
    expect(check).toHaveClass('animate-pop-in');
    expect(status).toHaveTextContent('친구 요청을 보냈어요.');
    expect(status).toHaveClass('animate-fade-in');
    // 보낸 결과 줄은 같은 줄이라 다시 떠오르지 않는다.
    expect(screen.getByRole('listitem')).toContainElement(sent);

    fireEvent.animationEnd(check);
    fireEvent.animationEnd(status);
    expect(check).not.toHaveClass('animate-pop-in');
    expect(status).not.toHaveClass('animate-fade-in');
  });

  it('fades a server error in as the result message', async () => {
    supabaseMock.rpc.mockResolvedValue({ error: { message: 'You are already friends.' } });
    render(<AddFriend session={session as never} onFriendAdded={vi.fn()} />);

    fireEvent.change(getInput(), { target: { value: 'friend@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '친구 요청' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('이미 친구예요.'));
    expect(screen.getByRole('status')).toHaveClass('animate-fade-in');
    expect(screen.getByRole('button', { name: '친구 요청' }).querySelector('svg')).toBeNull();
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
