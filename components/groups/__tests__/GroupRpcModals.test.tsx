import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
        vi.stubGlobal('confirm', vi.fn(() => true));
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('creates groups through create_group RPC only', async () => {
        const onCreated = vi.fn();
        const onClose = vi.fn();

        render(<CreateGroupModal isOpen onClose={onClose} onCreated={onCreated} />);

        fireEvent.change(screen.getByPlaceholderText('예: 아침형 인간 🌞'), {
            target: { value: 'Deep Work' },
        });
        fireEvent.click(screen.getByRole('button', { name: '그룹 만들기' }));

        await waitFor(() => {
            expect(supabaseMock.rpc).toHaveBeenCalledWith('create_group', {
                p_name: 'Deep Work',
            });
        });

        expect(supabaseMock.from).not.toHaveBeenCalled();
        expect(onCreated).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('joins groups through join_group_by_code RPC only', async () => {
        const onJoined = vi.fn();
        const onClose = vi.fn();

        render(<JoinGroupModal isOpen onClose={onClose} onJoined={onJoined} />);

        fireEvent.change(screen.getByPlaceholderText('코드 입력'), {
            target: { value: 'abc123' },
        });
        fireEvent.click(screen.getByRole('button', { name: '그룹 참여' }));

        await waitFor(() => {
            expect(supabaseMock.rpc).toHaveBeenCalledWith('join_group_by_code', {
                p_code: 'ABC123',
            });
        });

        expect(supabaseMock.from).not.toHaveBeenCalled();
        expect(onJoined).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('transfers leadership through transfer_group_leadership RPC only', async () => {
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
                members={[
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
                ]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /alex/i }));
        fireEvent.click(screen.getByRole('button', { name: '그룹장 이양' }));

        await waitFor(() => {
            expect(supabaseMock.rpc).toHaveBeenCalledWith('transfer_group_leadership', {
                p_group_id: 'group-1',
                p_new_leader_id: 'user-2',
            });
        });

        expect(supabaseMock.from).not.toHaveBeenCalled();
        expect(onTransferred).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
