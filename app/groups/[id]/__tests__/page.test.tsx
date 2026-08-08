import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock, toastMock, routerMock, tableDeleteMock, channelMock } = vi.hoisted(() => {
    const channelMock = {
        on: vi.fn(),
        subscribe: vi.fn(),
    };
    channelMock.on.mockReturnValue(channelMock);
    channelMock.subscribe.mockReturnValue(channelMock);

    return {
        toastMock: {
            success: vi.fn(),
            error: vi.fn(),
            loading: vi.fn(() => 'toast-id'),
        },
        routerMock: {
            push: vi.fn(),
        },
        tableDeleteMock: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
        channelMock,
        supabaseMock: {
            auth: {
                getUser: vi.fn(),
            },
            rpc: vi.fn(),
            from: vi.fn(),
            channel: vi.fn(() => channelMock),
            removeChannel: vi.fn(),
        },
    };
});

vi.mock('@/lib/supabase', () => ({
    supabase: supabaseMock,
}));

vi.mock('react-hot-toast', () => ({
    __esModule: true,
    default: toastMock,
    toast: toastMock,
    Toaster: () => null,
}));

vi.mock('next/navigation', () => ({
    useRouter: () => routerMock,
}));

vi.mock('@/components/MemberReportModal', () => ({ default: () => null }));
vi.mock('@/components/groups/MemberCard', () => ({ default: () => null }));
vi.mock('@/components/groups/TransferLeadershipModal', () => ({ default: () => null }));

import GroupDetailPage from '@/app/groups/[id]/page';

// React 19의 use()가 렌더 중 동기적으로 값을 읽을 수 있도록 status/value를 채운 Promise
const makeParams = (id: string) =>
    Object.assign(Promise.resolve({ id }), {
        status: 'fulfilled',
        value: { id },
    });

describe('GroupDetailPage 그룹 삭제', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();

        supabaseMock.auth.getUser.mockResolvedValue({
            data: {
                user: {
                    id: 'leader-1',
                },
            },
        });

        supabaseMock.from.mockImplementation((table: string) => {
            if (table === 'groups') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            single: vi.fn(() =>
                                Promise.resolve({
                                    data: { id: 'group-1', name: 'Focus Squad', leader_id: 'leader-1' },
                                    error: null,
                                })
                            ),
                        })),
                    })),
                    delete: tableDeleteMock,
                };
            }
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
                })),
                delete: tableDeleteMock,
            };
        });

        supabaseMock.rpc.mockImplementation((fn: string) => {
            if (fn === 'get_group_invite_code') {
                return Promise.resolve({ data: 'ABC123', error: null });
            }
            if (fn === 'get_group_study_time_v3') {
                return Promise.resolve({ data: [], error: null });
            }
            return Promise.resolve({ data: null, error: null });
        });

        supabaseMock.channel.mockReturnValue(channelMock);
        vi.stubGlobal('confirm', vi.fn(() => true));
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('delete_group RPC 한 번으로만 삭제하고 테이블 delete는 호출하지 않는다', async () => {
        render(<GroupDetailPage params={makeParams('group-1')} />);

        fireEvent.click(await screen.findByRole('button', { name: '그룹 삭제' }));

        await waitFor(() => {
            expect(supabaseMock.rpc).toHaveBeenCalledWith('delete_group', {
                p_group_id: 'group-1',
            });
        });

        expect(tableDeleteMock).not.toHaveBeenCalled();
        expect(toastMock.success).toHaveBeenCalledWith('그룹이 삭제되었습니다');
        expect(routerMock.push).toHaveBeenCalledWith('/groups');
    });

    it('멤버 공부시간을 공부일(로컬 05:00) 절대 범위로 조회한다', async () => {
        render(<GroupDetailPage params={makeParams('group-1')} />);

        await waitFor(() => {
            expect(supabaseMock.rpc).toHaveBeenCalledWith(
                'get_group_study_time_v3',
                expect.anything()
            );
        });

        const call = supabaseMock.rpc.mock.calls.find(
            (args: unknown[]) => args[0] === 'get_group_study_time_v3'
        ) as [string, { p_group_id: string; p_start_time: string; p_end_time: string }];
        const params = call[1];
        expect(params.p_group_id).toBe('group-1');

        const start = new Date(params.p_start_time);
        const end = new Date(params.p_end_time);
        // 로컬 05:00 경계에서 시작하는 24시간(-1ms) 공부일 범위다.
        expect(start.getHours()).toBe(5);
        expect(start.getMinutes()).toBe(0);
        expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
    });

    it('delete_group RPC가 실패하면 이동하지 않고 에러를 알린다', async () => {
        supabaseMock.rpc.mockImplementation((fn: string) => {
            if (fn === 'get_group_invite_code') {
                return Promise.resolve({ data: 'ABC123', error: null });
            }
            if (fn === 'get_group_study_time_v3') {
                return Promise.resolve({ data: [], error: null });
            }
            return Promise.resolve({ data: null, error: { message: 'delete failed' } });
        });

        render(<GroupDetailPage params={makeParams('group-1')} />);

        fireEvent.click(await screen.findByRole('button', { name: '그룹 삭제' }));

        await waitFor(() => {
            expect(toastMock.error).toHaveBeenCalledWith('그룹 삭제에 실패했습니다');
        });

        expect(tableDeleteMock).not.toHaveBeenCalled();
        expect(routerMock.push).not.toHaveBeenCalledWith('/groups');
    });
});
