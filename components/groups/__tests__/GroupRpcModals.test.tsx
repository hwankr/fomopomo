import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock, toastMock } = vi.hoisted(() => ({
    toastMock: {
        success: vi.fn(),
        error: vi.fn(),
        loading: vi.fn(() => 'toast-id'),
    },
    supabaseMock: {
        auth: {
            getUser: vi.fn(),
        },
        rpc: vi.fn(),
        from: vi.fn(),
    },
}));

vi.mock('@/lib/supabase', () => ({
    supabase: supabaseMock,
}));

vi.mock('react-hot-toast', () => ({
    __esModule: true,
    default: toastMock,
    toast: toastMock,
}));

import CreateGroupModal from '@/components/CreateGroupModal';
import JoinGroupModal from '@/components/JoinGroupModal';
import TransferLeadershipModal from '@/components/groups/TransferLeadershipModal';

const transferMembers = [
    {
        id: 'member-1',
        user_id: 'user-1',
        nickname: 'Leader',
        profiles: { email: 'leader@example.com' },
    },
    {
        id: 'member-2',
        user_id: 'user-2',
        nickname: 'Alex',
        profiles: { email: 'alex@example.com' },
    },
];

describe('group RPC modals', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        supabaseMock.auth.getUser.mockResolvedValue({
            data: {
                user: {
                    id: 'user-1',
                },
            },
        });
        supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('creates groups through create_group RPC only', async () => {
        const onCreated = vi.fn();
        const onClose = vi.fn();
        supabaseMock.rpc.mockResolvedValue({ data: [{ id: 'group-9', name: 'Deep Work' }], error: null });

        render(<CreateGroupModal isOpen onClose={onClose} onCreated={onCreated} />);

        const dialog = screen.getByRole('dialog', { name: '새 그룹' });
        const input = within(dialog).getByLabelText('그룹 이름');
        // 입력 대화상자는 첫 실제 컨트롤(이름 입력)에 포커스를 둔다.
        expect(document.activeElement).toBe(input);
        expect(within(dialog).getByRole('button', { name: '만들기' }).hasAttribute('disabled')).toBe(true);

        fireEvent.change(input, { target: { value: 'Deep Work' } });
        fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }));

        await waitFor(() => {
            expect(supabaseMock.rpc).toHaveBeenCalledWith('create_group', {
                p_name: 'Deep Work',
            });
        });

        expect(supabaseMock.from).not.toHaveBeenCalled();
        expect(onCreated).toHaveBeenCalledTimes(1);
        expect(onCreated).toHaveBeenCalledWith('group-9');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes the create dialog with 취소 without calling the RPC', () => {
        const onClose = vi.fn();

        render(<CreateGroupModal isOpen onClose={onClose} onCreated={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: '취소' }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(supabaseMock.rpc).not.toHaveBeenCalled();
    });

    it('joins groups through join_group_by_code RPC only', async () => {
        const onJoined = vi.fn();
        const onClose = vi.fn();

        render(<JoinGroupModal isOpen onClose={onClose} onJoined={onJoined} />);

        fireEvent.change(screen.getByLabelText('초대 코드'), {
            target: { value: 'abc123' },
        });
        fireEvent.click(screen.getByRole('button', { name: '참여하기' }));

        await waitFor(() => {
            expect(supabaseMock.rpc).toHaveBeenCalledWith('join_group_by_code', {
                p_code: 'ABC123',
            });
        });

        expect(supabaseMock.from).not.toHaveBeenCalled();
        expect(onJoined).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('prefills the invite code from an invite link and keeps the dialog open on a bad code', async () => {
        const onJoined = vi.fn();
        const onClose = vi.fn();
        supabaseMock.rpc.mockResolvedValue({ data: null, error: { message: 'Invalid group code' } });

        render(<JoinGroupModal isOpen initialCode="dawn05" onClose={onClose} onJoined={onJoined} />);

        expect((screen.getByLabelText('초대 코드') as HTMLInputElement).value).toBe('DAWN05');
        fireEvent.click(screen.getByRole('button', { name: '참여하기' }));

        await waitFor(() => {
            expect(toastMock.error).toHaveBeenCalledWith('그룹을 찾지 못했어요. 코드를 확인해 주세요.');
        });
        expect(supabaseMock.rpc).toHaveBeenCalledWith('join_group_by_code', { p_code: 'DAWN05' });
        expect(onJoined).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('transfers leadership through transfer_group_leadership RPC only, after a confirmation', async () => {
        const onTransferred = vi.fn();
        const onClose = vi.fn();

        render(
            <TransferLeadershipModal
                isOpen
                onClose={onClose}
                groupId="group-1"
                groupName="Focus Squad"
                currentUserId="user-1"
                onTransferred={onTransferred}
                members={transferMembers}
            />
        );

        // 본인은 후보에서 빠진다.
        expect(screen.queryByRole('button', { name: /leader/i })).toBeNull();

        const candidate = screen.getByRole('button', { name: /alex/i });
        fireEvent.click(candidate);
        expect(candidate.getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: '그룹장 넘기기' }));

        const confirm = await screen.findByRole('alertdialog', { name: '그룹장을 넘길까요?' });
        expect(supabaseMock.rpc).not.toHaveBeenCalled();
        // 되돌릴 수 없는 이양이라 진한 로즈(danger) 확인이다.
        expect(within(confirm).getByRole('button', { name: '넘기기' }).classList.contains('bg-pomo-deep')).toBe(true);
        fireEvent.click(within(confirm).getByRole('button', { name: '넘기기' }));

        await waitFor(() => {
            expect(supabaseMock.rpc).toHaveBeenCalledWith('transfer_group_leadership', {
                p_group_id: 'group-1',
                p_new_leader_id: 'user-2',
            });
        });

        expect(supabaseMock.from).not.toHaveBeenCalled();
        expect(toastMock.success).toHaveBeenCalledWith('Alex님이 새 그룹장이 됐어요.', { id: 'toast-id' });
        expect(onTransferred).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not transfer leadership when the confirmation is cancelled', async () => {
        render(
            <TransferLeadershipModal
                isOpen
                onClose={vi.fn()}
                groupId="group-1"
                groupName="Focus Squad"
                currentUserId="user-1"
                onTransferred={vi.fn()}
                members={transferMembers}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /alex/i }));
        fireEvent.click(screen.getByRole('button', { name: '그룹장 넘기기' }));
        const confirm = await screen.findByRole('alertdialog', { name: '그룹장을 넘길까요?' });
        fireEvent.click(within(confirm).getByRole('button', { name: '취소' }));

        await waitFor(() => {
            expect(screen.queryByRole('alertdialog')).toBeNull();
        });
        expect(supabaseMock.rpc).not.toHaveBeenCalled();
    });
});
