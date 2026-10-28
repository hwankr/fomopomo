import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 그룹 상세의 움직임: 리포트·그룹장 넘기기 창이 닫힐 때 공통 퇴장 애니메이션을 하는지(부모가 바로 내리지 않는지),
// 복사한 버튼의 체크, 사용자가 고른 그룹 내용의 등장. 창은 실제 MemberReportModal·TransferLeadershipModal을 쓴다.
const { supabaseMock, toastMock, channelMock, tables } = vi.hoisted(() => {
    const channelMock = { on: vi.fn(), subscribe: vi.fn() };
    channelMock.on.mockReturnValue(channelMock);
    channelMock.subscribe.mockReturnValue(channelMock);

    // 테이블별 응답. select().eq().gte()... 어떤 체인이든 await하면 이 값으로 끝난다.
    const tables: Record<string, unknown> = {};
    const query = (table: string) => {
        const result = () => Promise.resolve({ data: tables[table] ?? [], error: null });
        const chain: Record<string, unknown> = {};
        ['select', 'eq', 'gte', 'lte', 'in', 'order', 'update', 'delete'].forEach((method) => {
            chain[method] = vi.fn(() => chain);
        });
        chain.single = vi.fn(result);
        chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => result().then(resolve, reject);
        return chain;
    };

    return {
        tables,
        channelMock,
        toastMock: { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => 'toast-id') },
        supabaseMock: {
            auth: { getUser: vi.fn() },
            from: vi.fn(query),
            rpc: vi.fn(),
            channel: vi.fn(() => channelMock),
            removeChannel: vi.fn(),
        },
    };
});

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('react-hot-toast', () => ({ __esModule: true, default: toastMock, toast: toastMock }));

import GroupDetail from '../GroupDetail';

const profile = (id: string) => ({
    id,
    email: `${id}@example.com`,
    status: 'offline',
    current_task: null,
    last_active_at: '2026-10-01T00:00:00.000Z',
    study_start_time: null,
    total_stopwatch_time: null,
});

// happy-dom은 CSS 애니메이션을 돌리지 않는다. 브라우저처럼 닫히는 덮개에서 퇴장 애니메이션이 도는 것처럼 꾸미고,
// 끝나는 시점은 테스트가 정한다(components/ui/__tests__/ModalDialogExit.test.tsx와 같은 방식).
const running: Array<() => void> = [];

function mockExitAnimations() {
    Object.defineProperty(Element.prototype, 'getAnimations', {
        configurable: true,
        value(this: Element, options?: { subtree?: boolean }) {
            const elements = [this, ...(options?.subtree ? Array.from(this.querySelectorAll('*')) : [])];
            return elements
                .filter((element) => element.classList.contains('ui-dialog-overlay') && element.getAttribute('data-state') === 'closed')
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

const finishExitAnimations = () => act(async () => {
    running.splice(0).forEach((finish) => finish());
});

const closingOverlay = () => document.querySelector('.ui-dialog-overlay[data-state="closed"]');

const renderDetail = (props: { animateIn?: boolean } = {}) =>
    render(<GroupDetail groupId="group-1" onRemoved={vi.fn()} onLoadError={vi.fn()} {...props} />);

describe('GroupDetail motion', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        running.length = 0;
        tables.groups = { id: 'group-1', name: 'Focus Squad', leader_id: 'leader-1' };
        tables.group_members = [
            { id: 'member-1', user_id: 'leader-1', joined_at: '', nickname: 'Leader', profiles: profile('leader-1') },
            { id: 'member-2', user_id: 'user-2', joined_at: '', nickname: 'Alex', profiles: profile('user-2') },
            { id: 'member-3', user_id: 'user-3', joined_at: '', nickname: 'Bora', profiles: profile('user-3') },
        ];
        tables.study_sessions = [];
        supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'leader-1' } } });
        supabaseMock.rpc.mockImplementation((fn: string) => {
            if (fn === 'get_group_invite_code') return Promise.resolve({ data: 'ABC123', error: null });
            return Promise.resolve({ data: [], error: null });
        });
        supabaseMock.channel.mockReturnValue(channelMock);
    });

    afterEach(() => {
        cleanup();
        delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
        vi.unstubAllGlobals();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('keeps the member report open as a closing dialog until its exit animation ends', async () => {
        mockExitAnimations();
        renderDetail();

        fireEvent.click(await screen.findByRole('button', { name: 'Alex 리포트 보기' }));
        const dialog = await screen.findByRole('dialog', { name: 'Alex님의 리포트' });
        expect(await within(dialog).findByText('오늘 기록된 작업이 없어요.')).toBeInTheDocument();
        expect(dialog).toHaveAttribute('data-state', 'open');

        fireEvent.click(within(dialog).getByRole('button', { name: '리포트 닫기' }));

        // 부모가 바로 내리지 않고 닫는다: 마지막 멤버 그대로 data-state="closed"로 남아 퇴장한다.
        const overlay = closingOverlay();
        expect(overlay).not.toBeNull();
        expect(overlay).toContainElement(dialog);
        expect(dialog).toHaveAttribute('data-state', 'closed');
        expect(overlay).toHaveAttribute('inert');
        expect(dialog).toHaveTextContent('Alex님의 리포트');
        expect(document.querySelector('[aria-modal="true"]')).toBeNull();

        await finishExitAnimations();
        expect(document.querySelector('.ui-dialog-overlay')).toBeNull();
    });

    it('opens a fresh report each time, for the member that was picked', async () => {
        renderDetail();

        fireEvent.click(await screen.findByRole('button', { name: 'Alex 리포트 보기' }));
        let dialog = await screen.findByRole('dialog', { name: 'Alex님의 리포트' });
        await within(dialog).findByText('오늘 기록된 작업이 없어요.');
        fireEvent.click(within(dialog).getByRole('button', { name: '리포트 닫기' }));
        expect(screen.queryByRole('dialog')).toBeNull();

        tables.study_sessions = [{ duration: 1500, task: '통계 과제' }];
        fireEvent.click(screen.getByRole('button', { name: 'Bora 리포트 보기' }));
        dialog = screen.getByRole('dialog', { name: 'Bora님의 리포트' });
        // 전 멤버의 결과를 잠깐이라도 보이지 않고 새로 불러온다.
        expect(within(dialog).getByRole('status')).toHaveTextContent('불러오는 중이에요…');
        expect(await within(dialog).findByText('통계 과제')).toBeInTheDocument();
        expect(supabaseMock.from).toHaveBeenCalledWith('study_sessions');
    });

    it('keeps the transfer dialog for its exit animation, and starts over when reopened', async () => {
        mockExitAnimations();
        renderDetail();

        fireEvent.click(await screen.findByRole('button', { name: '그룹장 넘기기' }));
        const dialog = screen.getByRole('dialog', { name: '그룹장 넘기기' });
        const alex = within(dialog).getByRole('button', { name: /Alex/ });
        fireEvent.click(alex);
        expect(alex).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));

        const overlay = closingOverlay();
        expect(overlay).not.toBeNull();
        expect(overlay).toContainElement(dialog);
        expect(dialog).toHaveAttribute('data-state', 'closed');
        expect(overlay).toHaveAttribute('inert');
        expect(document.querySelector('[aria-modal="true"]')).toBeNull();

        await finishExitAnimations();
        expect(document.querySelector('.ui-dialog-overlay')).toBeNull();

        // 다시 열면 전에 고른 멤버가 남아 있지 않다(예전처럼 새 창).
        fireEvent.click(screen.getByRole('button', { name: '그룹장 넘기기' }));
        const reopened = screen.getByRole('dialog', { name: '그룹장 넘기기' });
        expect(within(reopened).getByRole('button', { name: /Alex/ })).toHaveAttribute('aria-pressed', 'false');
        expect(within(reopened).getByRole('button', { name: '그룹장 넘기기' })).toBeDisabled();
        expect(supabaseMock.rpc).not.toHaveBeenCalledWith('transfer_group_leadership', expect.anything());
    });

    it('keeps both retained dialogs distinct while report and transfer are opened and closed in turn', async () => {
        mockExitAnimations();
        const consoleError = vi.spyOn(console, 'error');
        renderDetail();

        // 리포트와 그룹장 넘기기 창은 닫혀도 남는 형제다. 둘을 번갈아 두 번씩 열고 닫는다.
        const openAndCloseReport = async (name: string, task: string) => {
            tables.study_sessions = [{ duration: 1500, task }];
            fireEvent.click(screen.getByRole('button', { name: `${name} 리포트 보기` }));
            const dialog = screen.getByRole('dialog', { name: `${name}님의 리포트` });
            // 열 때마다 새로 불러온다(전 멤버의 결과가 남지 않는다).
            expect(within(dialog).getByRole('status')).toHaveTextContent('불러오는 중이에요…');
            expect(await within(dialog).findByText(task)).toBeInTheDocument();
            fireEvent.click(within(dialog).getByRole('button', { name: '리포트 닫기' }));
            expect(dialog).toHaveAttribute('data-state', 'closed');
            expect(closingOverlay()).toContainElement(dialog);
            await finishExitAnimations();
            expect(dialog).not.toBeInTheDocument();
        };
        const openAndCloseTransfer = async () => {
            fireEvent.click(screen.getByRole('button', { name: '그룹장 넘기기' }));
            const dialog = screen.getByRole('dialog', { name: '그룹장 넘기기' });
            // 열 때마다 고른 멤버 없이 시작한다.
            expect(within(dialog).queryAllByRole('button', { pressed: true })).toHaveLength(0);
            fireEvent.click(within(dialog).getByRole('button', { name: /Bora/ }));
            expect(within(dialog).getByRole('button', { name: /Bora/ })).toHaveAttribute('aria-pressed', 'true');
            fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
            expect(dialog).toHaveAttribute('data-state', 'closed');
            expect(closingOverlay()).toContainElement(dialog);
            await finishExitAnimations();
            expect(dialog).not.toBeInTheDocument();
        };

        await screen.findByRole('button', { name: 'Alex 리포트 보기' });
        await openAndCloseReport('Alex', '통계 과제');
        await openAndCloseTransfer();
        await openAndCloseReport('Bora', '영어 단어');
        await openAndCloseTransfer();

        expect(document.querySelectorAll('.ui-dialog-overlay')).toHaveLength(0);
        const keyErrors = consoleError.mock.calls.filter((args) => args.some((arg) => String(arg).includes('same key')));
        expect(keyErrors).toEqual([]);
        expect(supabaseMock.rpc).not.toHaveBeenCalledWith('transfer_group_leadership', expect.anything());
    });

    it('shows a check in place of the label after copying, then brings the label back', async () => {
        const writeText = vi.fn(() => Promise.resolve());
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
        renderDetail();

        const linkButton = await screen.findByRole('button', { name: '초대 링크 복사' });
        const label = within(linkButton).getByText('초대 링크 복사');
        const check = () => linkButton.querySelector('svg');
        // 처음에는 체크가 숨어 있고 움직이지 않는다.
        expect(label).not.toHaveClass('opacity-0');
        expect(check()?.parentElement).toHaveClass('opacity-0');
        expect(check()).not.toHaveClass('animate-pop-in');

        vi.useFakeTimers();
        await act(async () => {
            fireEvent.click(linkButton);
        });
        expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/groups?code=ABC123`);
        expect(toastMock.success).toHaveBeenCalledWith('초대 링크를 복사했어요.');
        // 이름은 그대로(체크는 aria-hidden) 두고, 글자가 체크로 바뀐다.
        expect(screen.getByRole('button', { name: '초대 링크 복사' })).toBe(linkButton);
        expect(label).toHaveClass('opacity-0');
        expect(check()?.parentElement).not.toHaveClass('opacity-0');
        expect(check()).toHaveClass('animate-pop-in');

        // 코드 버튼은 '코드' 글자 자리만 체크로 바뀌고, 링크 버튼은 돌아온다.
        const codeButton = screen.getByRole('button', { name: '초대 코드 ABC123 복사' });
        await act(async () => {
            fireEvent.click(codeButton);
        });
        expect(writeText).toHaveBeenLastCalledWith('ABC123');
        expect(within(codeButton).getByText('코드')).toHaveClass('opacity-0');
        expect(codeButton.querySelector('svg')).toHaveClass('animate-pop-in');
        expect(label).not.toHaveClass('opacity-0');
        expect(check()).not.toHaveClass('animate-pop-in');

        act(() => {
            vi.advanceTimersByTime(1600);
        });
        expect(within(codeButton).getByText('코드')).not.toHaveClass('opacity-0');
        expect(codeButton.querySelector('svg')).not.toHaveClass('animate-pop-in');
    });

    it('does not show a check when copying fails', async () => {
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) } });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        renderDetail();

        const linkButton = await screen.findByRole('button', { name: '초대 링크 복사' });
        fireEvent.click(linkButton);

        await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('복사하지 못했어요. 다시 시도해 주세요.'));
        expect(within(linkButton).getByText('초대 링크 복사')).not.toHaveClass('opacity-0');
        expect(linkButton.querySelector('svg')).not.toHaveClass('animate-pop-in');
    });

    it('fades the loaded content in only for a group the user picked', async () => {
        const { unmount } = renderDetail();
        const heading = await screen.findByRole('heading', { level: 2, name: 'Focus Squad' });
        expect(heading.closest('section')).not.toHaveClass('animate-fade-in');
        unmount();

        renderDetail({ animateIn: true });
        const picked = await screen.findByRole('heading', { level: 2, name: 'Focus Squad' });
        expect(picked.closest('section')).toHaveClass('animate-fade-in');
    });

    it('raises the inline rename form when the leader starts renaming', async () => {
        renderDetail();

        fireEvent.click(await screen.findByRole('button', { name: '그룹 이름 수정' }));

        const input = screen.getByRole('textbox', { name: '그룹 이름' });
        expect(input.closest('form')).toHaveClass('animate-fade-up');
        expect(input).toHaveValue('Focus Squad');
        expect(input).toHaveFocus();
    });
});
