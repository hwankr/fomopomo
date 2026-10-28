import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { supabaseMock, toastMock, routerMock, authState, navbarMock, groupsState } = vi.hoisted(() => ({
    toastMock: {
        success: vi.fn(),
        error: vi.fn(),
        loading: vi.fn(() => 'toast-id'),
    },
    routerMock: {
        push: vi.fn(),
        replace: vi.fn(),
    },
    authState: {
        session: { user: { id: 'user-1' } } as { user: { id: string } } | null,
        loading: false,
    },
    navbarMock: vi.fn(),
    groupsState: {
        groups: [] as Array<{ id: string; name: string; leader_id: string }>,
        counts: {} as Record<string, number>,
    },
    supabaseMock: {
        auth: {
            getUser: vi.fn(),
            signInWithOAuth: vi.fn(),
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
    Toaster: () => null,
}));

vi.mock('next/navigation', () => ({
    useRouter: () => routerMock,
    usePathname: () => '/groups',
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

// 상세는 /groups/[id] 테스트와 GroupDetail 구성 요소가 다룬다. 여기서는 어느 그룹이 선택됐는지만 본다.
vi.mock('@/components/groups/GroupDetail', () => ({
    default: ({ groupId }: { groupId: string }) => <p>{`detail:${groupId}`}</p>,
}));

import GroupsPage from '@/app/groups/page';
import GroupDetailRoute from '@/app/groups/[id]/page';

// /groups/group-b로 바로 들어온 경우(두 번째 칩이 선택된 채로 열린다)
const GroupDetailPageForB = () => (
    <GroupDetailRoute
        params={Object.assign(Promise.resolve({ id: 'group-b' }), { status: 'fulfilled', value: { id: 'group-b' } })}
    />
);

describe('GroupsPage (/groups)', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        window.history.replaceState(null, '', '/groups');
        authState.session = { user: { id: 'user-1' } };
        authState.loading = false;
        groupsState.groups = [
            { id: 'group-a', name: '새벽 스터디', leader_id: 'user-1' },
            { id: 'group-b', name: '토익 900', leader_id: 'user-9' },
        ];
        groupsState.counts = { 'group-a': 3, 'group-b': 5 };

        supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
        supabaseMock.rpc.mockResolvedValue({ data: null, error: null });
        supabaseMock.from.mockImplementation(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() =>
                    Promise.resolve({
                        data: groupsState.groups.map((group) => ({ groups: group })),
                        error: null,
                    })
                ),
                in: vi.fn(() =>
                    Promise.resolve({
                        data: Object.entries(groupsState.counts).flatMap(([groupId, count]) =>
                            Array.from({ length: count }, () => ({ group_id: groupId }))
                        ),
                        error: null,
                    })
                ),
            })),
        }));
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
        window.history.replaceState(null, '', '/groups');
    });

    it('로그아웃 상태면 로그인 안내를 보여 주고, 그룹 만들기는 로그인 창을 연다', async () => {
        authState.session = null;

        render(<GroupsPage />);

        expect(screen.getByRole('heading', { level: 1, name: '그룹' })).toBeTruthy();
        expect(screen.getByRole('heading', { level: 2, name: '로그인하고 그룹에 참여해 보세요' })).toBeTruthy();
        expect(screen.queryByRole('group', { name: '그룹 보기 방식' })).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: '그룹 만들기' }));
        expect(await screen.findByRole('dialog')).toBeTruthy();
        expect(screen.queryByRole('dialog', { name: '새 그룹' })).toBeNull();
    });

    it('내 그룹을 칩으로 보여 주고 첫 그룹을 선택한다', async () => {
        render(<GroupsPage />);

        expect(await screen.findByText('detail:group-a')).toBeTruthy();
        expect(screen.getByText('내 그룹 2개')).toBeTruthy();

        const viewTabs = screen.getByRole('group', { name: '그룹 보기 방식' });
        expect(within(viewTabs).getByRole('button', { name: '내 그룹 2' }).getAttribute('aria-pressed')).toBe('true');

        const chips = screen.getByRole('group', { name: '내 그룹' });
        const first = within(chips).getByRole('button', { name: '새벽 스터디 3명' });
        const second = within(chips).getByRole('button', { name: '토익 900 5명' });
        expect(first.getAttribute('aria-pressed')).toBe('true');
        expect(second.getAttribute('aria-pressed')).toBe('false');

        // 상단 바와 헤더는 Navbar로 그린다.
        const navbarProps = navbarMock.mock.calls.at(-1)?.[0] as { session: unknown; mobileTopBar: unknown };
        expect(navbarProps.session).toBe(authState.session);
        expect(navbarProps.mobileTopBar).toBeTruthy();
    });

    it('다른 칩을 고르면 그 그룹을 보여 주고 주소를 /groups/[id]로 맞춘다', async () => {
        render(<GroupsPage />);

        const chips = await screen.findByRole('group', { name: '내 그룹' });
        fireEvent.click(within(chips).getByRole('button', { name: '토익 900 5명' }));

        expect(await screen.findByText('detail:group-b')).toBeTruthy();
        expect(within(chips).getByRole('button', { name: '토익 900 5명' }).getAttribute('aria-pressed')).toBe('true');
        expect(window.location.pathname).toBe('/groups/group-b');
    });

    it('칩 줄 너비가 바뀌어 넘치게 되면 선택한 칩이 보이도록 줄을 옮긴다(포커스는 그대로)', async () => {
        const observers: Array<{ callback: () => void; target: Element | null }> = [];
        class ResizeObserverStub {
            callback: () => void;
            target: Element | null = null;
            constructor(callback: () => void) {
                this.callback = callback;
                observers.push(this);
            }
            observe(target: Element) {
                this.target = target;
            }
            disconnect() {
                this.target = null;
            }
        }
        vi.stubGlobal('ResizeObserver', ResizeObserverStub);
        window.history.replaceState(null, '', '/groups/group-b');

        render(<GroupDetailPageForB />);

        const chips = await screen.findByRole('group', { name: '내 그룹' });
        const selected = within(chips).getByRole('button', { name: '토익 900 5명' });
        await waitFor(() => {
            expect(selected.getAttribute('aria-pressed')).toBe('true');
        });
        const observer = observers.find((item) => item.target === chips);
        expect(observer).toBeTruthy();

        // 데스크톱 → 모바일: 줄이 좁아져 넘치고 선택한 칩이 오른쪽 밖(400–540px)에 있다.
        Object.defineProperty(chips, 'scrollWidth', { configurable: true, value: 560 });
        Object.defineProperty(chips, 'clientWidth', { configurable: true, value: 390 });
        chips.getBoundingClientRect = () => ({ left: 0, right: 390, top: 0, bottom: 40, width: 390, height: 40, x: 0, y: 0, toJSON: () => ({}) });
        selected.getBoundingClientRect = () => ({ left: 400, right: 540, top: 0, bottom: 40, width: 140, height: 40, x: 400, y: 0, toJSON: () => ({}) });
        const focusedBefore = document.activeElement;

        observer!.callback();

        expect(chips.scrollLeft).toBe(400 - 16);
        expect(document.activeElement).toBe(focusedBefore);
    });

    it('속한 그룹이 없으면 빈 상태 문구를 보여 준다', async () => {
        groupsState.groups = [];
        groupsState.counts = {};

        render(<GroupsPage />);

        expect(
            await screen.findByText('아직 속한 그룹이 없어요. 초대 코드로 참여하거나 새 그룹을 만들어 보세요.')
        ).toBeTruthy();
        expect(screen.getByText('아직 속한 그룹이 없어요')).toBeTruthy();
        expect(screen.queryByRole('group', { name: '내 그룹' })).toBeNull();
    });

    it('코드로 참여 탭에서 초대 코드로 참여하고, 참여한 그룹을 선택한다', async () => {
        supabaseMock.rpc.mockResolvedValue({ data: [{ id: 'group-c', name: '논문 쓰기' }], error: null });

        render(<GroupsPage />);

        await screen.findByText('detail:group-a');
        fireEvent.click(screen.getByRole('button', { name: '코드로 참여' }));

        const panel = screen.getByRole('region', { name: '초대 코드로 참여' });
        fireEvent.change(within(panel).getByLabelText('초대 코드'), { target: { value: 'dawn05' } });
        fireEvent.click(within(panel).getByRole('button', { name: '참여하기' }));

        await waitFor(() => {
            expect(supabaseMock.rpc).toHaveBeenCalledWith('join_group_by_code', { p_code: 'DAWN05' });
        });
        expect(await screen.findByText('detail:group-c')).toBeTruthy();
        expect(toastMock.success).toHaveBeenCalledWith('그룹에 참여했어요.');
        expect(window.location.pathname).toBe('/groups/group-c');
    });

    it('그룹 만들기 대화상자로 만들고, 만든 그룹을 선택한다', async () => {
        supabaseMock.rpc.mockResolvedValue({ data: [{ id: 'group-new', name: '기말고사 2주 작전' }], error: null });

        render(<GroupsPage />);

        await screen.findByText('detail:group-a');
        fireEvent.click(screen.getByRole('button', { name: '그룹 만들기' }));

        const dialog = await screen.findByRole('dialog', { name: '새 그룹' });
        fireEvent.change(within(dialog).getByLabelText('그룹 이름'), { target: { value: '기말고사 2주 작전' } });
        fireEvent.click(within(dialog).getByRole('button', { name: '만들기' }));

        await waitFor(() => {
            expect(supabaseMock.rpc).toHaveBeenCalledWith('create_group', { p_name: '기말고사 2주 작전' });
        });
        expect(await screen.findByText('detail:group-new')).toBeTruthy();
        expect(screen.queryByRole('dialog', { name: '새 그룹' })).toBeNull();
    });

    it('초대 링크(?code=)로 들어오면 코드를 채운 참여 창을 열고, 닫으면 주소에서 코드를 지운다', async () => {
        window.history.replaceState(null, '', '/groups?code=abc123');

        render(<GroupsPage />);

        const dialog = await screen.findByRole('dialog', { name: '초대 코드로 참여' });
        expect((within(dialog).getByLabelText('초대 코드') as HTMLInputElement).value).toBe('ABC123');

        fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));

        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: '초대 코드로 참여' })).toBeNull();
        });
        expect(window.location.search).toBe('');
        expect(supabaseMock.rpc).not.toHaveBeenCalledWith('join_group_by_code', expect.anything());
    });

    it('로그아웃 상태로 초대 링크를 열면 참여 대신 로그인을 안내한다', () => {
        authState.session = null;
        window.history.replaceState(null, '', '/groups?code=abc123');

        render(<GroupsPage />);

        expect(
            screen.getByRole('heading', { level: 2, name: '초대받은 그룹에 참여하려면 로그인해 주세요' })
        ).toBeTruthy();
        expect(screen.queryByRole('dialog', { name: '초대 코드로 참여' })).toBeNull();
    });
});
