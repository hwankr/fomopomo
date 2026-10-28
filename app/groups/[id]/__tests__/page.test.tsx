import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock, toastMock, routerMock, tableDeleteMock, deleteFilters, channelMock, authState, navbarMock, groupState } = vi.hoisted(() => {
    const channelMock = {
        on: vi.fn(),
        subscribe: vi.fn(),
    };
    channelMock.on.mockReturnValue(channelMock);
    channelMock.subscribe.mockReturnValue(channelMock);

    // delete().eq().eq() 체인을 기록하고 await하면 성공으로 끝난다.
    const deleteFilters: Array<[string, unknown]> = [];
    const makeDeleteChain = () => {
        const chain = {
            eq: vi.fn((column: string, value: unknown) => {
                deleteFilters.push([column, value]);
                return chain;
            }),
            then: (onFulfilled: (value: { error: null }) => unknown) =>
                Promise.resolve({ error: null }).then(onFulfilled),
        };
        return chain;
    };

    return {
        toastMock: {
            success: vi.fn(),
            error: vi.fn(),
            loading: vi.fn(() => 'toast-id'),
        },
        routerMock: {
            push: vi.fn(),
            replace: vi.fn(),
        },
        tableDeleteMock: vi.fn(() => makeDeleteChain()),
        deleteFilters,
        channelMock,
        authState: {
            session: { user: { id: 'leader-1' } } as { user: { id: string } } | null,
            loading: false,
        },
        navbarMock: vi.fn(),
        groupState: {
            group: { id: 'group-1', name: 'Focus Squad', leader_id: 'leader-1' },
            groupError: null as { message: string } | null,
        },
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
    usePathname: () => '/groups/group-1',
}));

vi.mock('@/hooks/useAuthSession', () => ({
    useAuthSession: () => authState,
}));

vi.mock('@/components/Navbar', () => ({
    default: (props: unknown) => {
        navbarMock(props);
        return null;
    },
}));

vi.mock('@/components/MemberReportModal', () => ({ default: () => null }));
vi.mock('@/components/groups/TransferLeadershipModal', () => ({ default: () => null }));
vi.mock('@/components/groups/MemberRow', () => ({
    default: ({ rank, member, studyTime }: { rank: number; member: { nickname: string }; studyTime: number }) => (
        <li>{`${rank}. ${member.nickname} ${studyTime}`}</li>
    ),
}));

import GroupDetailPage from '@/app/groups/[id]/page';

// React 19의 use()가 렌더 중 동기적으로 값을 읽을 수 있도록 status/value를 채운 Promise
const makeParams = (id: string) =>
    Object.assign(Promise.resolve({ id }), {
        status: 'fulfilled',
        value: { id },
    });

const profile = (id: string) => ({
    id,
    email: `${id}@example.com`,
    status: 'offline',
    current_task: null as string | null,
    last_active_at: '2026-10-01T00:00:00.000Z',
    study_start_time: null as string | null,
    total_stopwatch_time: null as number | null,
});

const memberRows: Array<{ id: string; user_id: string; joined_at: string; nickname: string; profiles: ReturnType<typeof profile> }> = [];
const resetMemberRows = () => {
    memberRows.splice(
        0,
        memberRows.length,
        { id: 'member-1', user_id: 'leader-1', joined_at: '', nickname: 'Leader', profiles: profile('leader-1') },
        { id: 'member-2', user_id: 'user-2', joined_at: '', nickname: 'Alex', profiles: profile('user-2') },
    );
};

const renderPage = () => render(<GroupDetailPage params={makeParams('group-1')} />);

describe('GroupDetailPage (/groups/[id])', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        deleteFilters.length = 0;
        resetMemberRows();
        authState.session = { user: { id: 'leader-1' } };
        groupState.group = { id: 'group-1', name: 'Focus Squad', leader_id: 'leader-1' };
        groupState.groupError = null;

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
                                Promise.resolve(
                                    groupState.groupError
                                        ? { data: null, error: groupState.groupError }
                                        : { data: groupState.group, error: null }
                                )
                            ),
                        })),
                    })),
                    delete: tableDeleteMock,
                };
            }
            if (table === 'group_members') {
                return {
                    select: vi.fn((columns: string) => ({
                        // 그룹 목록(groups 조인)과 상세의 멤버 목록을 같은 테이블에서 읽는다.
                        eq: vi.fn(() =>
                            Promise.resolve({
                                data: columns.includes('groups (')
                                    ? [{ groups: groupState.group }]
                                    : memberRows,
                                error: null,
                            })
                        ),
                        in: vi.fn(() =>
                            Promise.resolve({
                                data: memberRows.map(() => ({ group_id: 'group-1' })),
                                error: null,
                            })
                        ),
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
                return Promise.resolve({
                    data: [
                        { user_id: 'leader-1', total_seconds: 600 },
                        { user_id: 'user-2', total_seconds: 4800 },
                    ],
                    error: null,
                });
            }
            return Promise.resolve({ data: null, error: null });
        });

        supabaseMock.channel.mockReturnValue(channelMock);
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('헤더(Navbar)와 그룹 상단 바를 그리고, 주소의 그룹을 선택한 채로 보여 준다', async () => {
        renderPage();

        expect(await screen.findByRole('heading', { level: 2, name: 'Focus Squad' })).toBeTruthy();

        const navbarProps = navbarMock.mock.calls.at(-1)?.[0] as { session: unknown; mobileTopBar: unknown };
        expect(navbarProps.session).toBe(authState.session);
        expect(navbarProps.mobileTopBar).toBeTruthy();

        const chips = await screen.findByRole('group', { name: '내 그룹' });
        const chip = within(chips).getByRole('button', { name: /Focus Squad/ });
        expect(chip.getAttribute('aria-pressed')).toBe('true');
        expect(chip.textContent).toContain('2명');
    });

    it('이번 주 공부 시간 순으로 멤버 순위와 합계·내 순위를 보여 준다', async () => {
        renderPage();

        const ranking = await screen.findByRole('list', { name: '이번 주 집중 시간 순위' });
        const rows = within(ranking).getAllByRole('listitem').map((row) => row.textContent);
        expect(rows).toEqual(['1. Alex 4800', '2. Leader 600']);

        // 600 + 4800초 = 1시간 30분, 리더(나)는 2위
        expect(screen.getByText('1시간 30분')).toBeTruthy();
        expect(screen.getByText('2위')).toBeTruthy();
        expect(screen.getByText('리더 Leader')).toBeTruthy();
    });

    it('공부·일시정지 중인 몫까지 더한 실시간 시간으로 순위와 합계를 매긴다', async () => {
        // 저장된 시간은 Alex(4800초)가 앞서지만, Leader는 2시간째 공부 중이라 실시간으로는 1위다.
        memberRows[0].profiles = {
            ...memberRows[0].profiles,
            status: 'studying',
            study_start_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        };
        memberRows[1].profiles = { ...memberRows[1].profiles, status: 'paused', total_stopwatch_time: 600 };

        renderPage();

        const ranking = await screen.findByRole('list', { name: '이번 주 집중 시간 순위' });
        const rows = within(ranking).getAllByRole('listitem').map((row) => row.textContent ?? '');
        expect(rows[0]).toMatch(/^1\. Leader \d+$/);
        expect(Number(rows[0].split(' ').at(-1))).toBeGreaterThanOrEqual(600 + 2 * 60 * 60);
        expect(rows[1]).toBe('2. Alex 5400');
        expect(screen.getByText('1위')).toBeTruthy();
    });

    it('delete_group RPC 한 번으로만 삭제하고 테이블 delete는 호출하지 않는다', async () => {
        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: '그룹 삭제' }));
        const dialog = await screen.findByRole('alertdialog', { name: '그룹을 삭제할까요?' });
        expect(supabaseMock.rpc).not.toHaveBeenCalledWith('delete_group', expect.anything());

        // 되돌릴 수 없는 삭제는 진한 로즈(danger) 확인이고, 처음 포커스는 안전한 취소에 있다.
        const confirmButton = within(dialog).getByRole('button', { name: '삭제하기' });
        expect(confirmButton.classList.contains('bg-pomo-deep')).toBe(true);
        expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '취소' }));
        fireEvent.click(confirmButton);

        await waitFor(() => {
            expect(supabaseMock.rpc).toHaveBeenCalledWith('delete_group', {
                p_group_id: 'group-1',
            });
        });

        expect(tableDeleteMock).not.toHaveBeenCalled();
        expect(toastMock.success).toHaveBeenCalledWith('그룹을 삭제했어요.');
        expect(routerMock.replace).toHaveBeenCalledWith('/groups');
    });

    it('삭제 확인에서 취소하면 RPC를 부르지 않는다', async () => {
        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: '그룹 삭제' }));
        const dialog = await screen.findByRole('alertdialog', { name: '그룹을 삭제할까요?' });
        fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));

        await waitFor(() => {
            expect(screen.queryByRole('alertdialog')).toBeNull();
        });
        expect(supabaseMock.rpc).not.toHaveBeenCalledWith('delete_group', expect.anything());
    });

    it('멤버 공부시간을 이번 공부주(월요일 로컬 05:00부터 7일) 절대 범위로 조회한다', async () => {
        renderPage();

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
        // 월요일 로컬 05:00 경계에서 시작하는 7일(-1ms) 공부주 범위이고, 지금이 그 안에 있다.
        expect(start.getDay()).toBe(1);
        expect(start.getHours()).toBe(5);
        expect(start.getMinutes()).toBe(0);
        expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000 - 1);
        expect(start.getTime()).toBeLessThanOrEqual(Date.now());
        expect(end.getTime()).toBeGreaterThanOrEqual(Date.now());
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

        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: '그룹 삭제' }));
        fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '삭제하기' }));

        await waitFor(() => {
            expect(toastMock.error).toHaveBeenCalledWith('그룹을 삭제하지 못했어요.');
        });

        expect(tableDeleteMock).not.toHaveBeenCalled();
        expect(routerMock.replace).not.toHaveBeenCalledWith('/groups');
        expect(routerMock.push).not.toHaveBeenCalledWith('/groups');
    });

    it('리더는 초대 링크와 초대 코드를 복사할 수 있다', async () => {
        const writeText = vi.fn(() => Promise.resolve());
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: '초대 링크 복사' }));
        await waitFor(() => {
            expect(toastMock.success).toHaveBeenCalledWith('초대 링크를 복사했어요.');
        });
        expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/groups?code=ABC123`);

        fireEvent.click(screen.getByRole('button', { name: '초대 코드 ABC123 복사' }));
        await waitFor(() => {
            expect(writeText).toHaveBeenLastCalledWith('ABC123');
        });
        expect(toastMock.success).toHaveBeenCalledWith('초대 코드를 복사했어요.');
    });

    it('리더가 아니면 초대·관리 대신 나가기만 보이고, 확인 후 내 멤버십만 지운다', async () => {
        authState.session = { user: { id: 'user-2' } };
        supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-2' } } });

        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: '그룹 나가기' }));
        expect(screen.queryByRole('button', { name: '초대 링크 복사' })).toBeNull();
        expect(screen.queryByRole('button', { name: '그룹 삭제' })).toBeNull();
        expect(supabaseMock.rpc).not.toHaveBeenCalledWith('get_group_invite_code', expect.anything());

        const dialog = await screen.findByRole('alertdialog', { name: '정말 나가시겠어요?' });
        expect(dialog.textContent).toContain('"Focus Squad"에서 나가면');
        // 그룹 나가기는 모드 동작이라 로즈(pomo) 채움 확인이다.
        const leaveButton = within(dialog).getByRole('button', { name: '나가기' });
        expect(leaveButton.classList.contains('bg-pomo')).toBe(true);
        expect(leaveButton.classList.contains('bg-pomo-deep')).toBe(false);
        fireEvent.click(leaveButton);

        await waitFor(() => {
            expect(toastMock.success).toHaveBeenCalledWith('그룹에서 나왔어요.');
        });
        expect(tableDeleteMock).toHaveBeenCalledTimes(1);
        expect(deleteFilters).toEqual([
            ['group_id', 'group-1'],
            ['user_id', 'user-2'],
        ]);
        expect(routerMock.replace).toHaveBeenCalledWith('/groups');
    });

    it('그룹을 불러오지 못하면 알리고 그룹 목록으로 돌아간다', async () => {
        groupState.groupError = { message: 'not a member' };

        renderPage();

        await waitFor(() => {
            expect(toastMock.error).toHaveBeenCalledWith('그룹을 불러오지 못했어요.');
        });
        expect(routerMock.replace).toHaveBeenCalledWith('/groups');
    });

    it('Realtime 채널로 이 그룹의 멤버·상태·공부 기록 변화를 구독한다', async () => {
        const { unmount } = renderPage();

        await screen.findByRole('heading', { level: 2, name: 'Focus Squad' });
        expect(supabaseMock.channel).toHaveBeenCalledWith('group-group-1');
        const tables = channelMock.on.mock.calls.map((args: unknown[]) => (args[1] as { table: string }).table);
        expect(tables).toEqual(['profiles', 'group_members', 'groups', 'study_sessions']);

        unmount();
        expect(supabaseMock.removeChannel).toHaveBeenCalledWith(channelMock);
    });
});
