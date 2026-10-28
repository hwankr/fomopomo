import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import MemberRow from '@/components/groups/MemberRow';

type Props = ComponentProps<typeof MemberRow>;

const baseMember: Props['member'] = {
    id: 'member-2',
    user_id: 'user-2',
    nickname: '박지훈',
    profiles: {
        id: 'user-2',
        email: 'jihoon@example.com',
        status: 'studying',
        current_task: '수학 기출',
        last_active_at: new Date().toISOString(),
        study_start_time: null,
        total_stopwatch_time: null,
    },
};

const renderRow = (overrides: Partial<Props> = {}) => {
    const props: Props = {
        member: baseMember,
        rank: 1,
        studyTime: 19 * 3600 + 40 * 60,
        barPercent: 100,
        isCurrentUser: false,
        isGroupLeader: false,
        showKickColumn: false,
        editingNickname: false,
        tempNickname: '',
        onTempNicknameChange: vi.fn(),
        onStartEditNickname: vi.fn(),
        onSaveNickname: vi.fn(),
        onCancelEditNickname: vi.fn(),
        onKickMember: vi.fn(),
        onSelectForReport: vi.fn(),
        ...overrides,
    };
    render(
        <ol>
            <MemberRow {...props} />
        </ol>
    );
    return props;
};

describe('MemberRow', () => {
    afterEach(() => {
        cleanup();
    });

    it('순위·이름·리더 표시·지금 상태·이번 주 시:분을 보여 준다', () => {
        renderRow({ isGroupLeader: true });

        const row = screen.getByRole('listitem');
        expect(row.textContent).toContain('1');
        expect(screen.getByText('리더')).toBeTruthy();
        expect(screen.getByText('공부 중 · 수학 기출')).toBeTruthy();
        expect(screen.getByText('19:40')).toBeTruthy();
        expect(screen.queryByText('나')).toBeNull();
    });

    it('일시정지 중이면 일시정지 상태와 지금 하던 작업을 보여 준다', () => {
        renderRow({
            member: {
                ...baseMember,
                profiles: { ...baseMember.profiles, status: 'paused', current_task: '토익 LC' },
            },
            studyTime: 3600 + 25 * 60,
        });

        expect(screen.getByText('일시정지 · 토익 LC')).toBeTruthy();
        expect(screen.getByText('1:25')).toBeTruthy();
    });

    it('보드의 바깥 높이(모바일 68px, 데스크톱 78px)를 최소 높이로 쓴다', () => {
        renderRow();

        const row = screen.getByRole('listitem');
        // 보드는 content-box(최소 높이 + 위아래 여백)이므로 border-box에서는 바깥 높이를 그대로 준다.
        expect(row.classList.contains('min-h-[68px]')).toBe(true);
        expect(row.classList.contains('md:min-h-[78px]')).toBe(true);
    });

    it('오프라인이면 마지막 활동을 한국어로 보여 준다', () => {
        renderRow({
            member: {
                ...baseMember,
                profiles: {
                    ...baseMember.profiles,
                    status: 'offline',
                    last_active_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
                },
            },
        });

        expect(screen.getByText(/^오프라인 · .*전$/)).toBeTruthy();
    });

    it('줄이나 이름 버튼을 누르면 리포트를 연다', () => {
        const props = renderRow();

        fireEvent.click(screen.getByRole('button', { name: '박지훈 리포트 보기' }));
        expect(props.onSelectForReport).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('listitem'));
        expect(props.onSelectForReport).toHaveBeenCalledTimes(2);
    });

    it('리더 화면에서는 다른 멤버를 내보낼 수 있고, 리포트는 열리지 않는다', () => {
        const props = renderRow({ showKickColumn: true });

        fireEvent.click(screen.getByRole('button', { name: '박지훈님 내보내기' }));

        expect(props.onKickMember).toHaveBeenCalledTimes(1);
        expect(props.onSelectForReport).not.toHaveBeenCalled();
    });

    it('내 줄에는 나 표시와 닉네임 수정이 있고 내보내기는 없다', () => {
        const props = renderRow({ isCurrentUser: true, showKickColumn: true });

        expect(screen.getByText('나')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /내보내기/ })).toBeNull();

        // 옅은 연필이라 먹색 포커스 링과 44px 누름 영역을 쓴다.
        const editButton = screen.getByRole('button', { name: '닉네임 수정' });
        expect(editButton.classList.contains('ui-focus-ink')).toBe(true);
        expect(editButton.classList.contains('size-11')).toBe(true);

        fireEvent.click(editButton);
        expect(props.onStartEditNickname).toHaveBeenCalledTimes(1);
        expect(props.onSelectForReport).not.toHaveBeenCalled();
    });

    it('닉네임 수정 중에는 저장(Enter)·취소(Escape)를 하고 리포트를 열지 않는다', () => {
        const props = renderRow({ isCurrentUser: true, editingNickname: true, tempNickname: '지훈' });

        const input = screen.getByLabelText('내 닉네임') as HTMLInputElement;
        expect(input.value).toBe('지훈');

        fireEvent.change(input, { target: { value: '새 이름' } });
        expect(props.onTempNicknameChange).toHaveBeenCalledWith('새 이름');

        fireEvent.submit(input.form!);
        expect(props.onSaveNickname).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(input, { key: 'Escape' });
        expect(props.onCancelEditNickname).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: '닉네임 저장' }));
        fireEvent.click(screen.getByRole('listitem'));
        expect(props.onSelectForReport).not.toHaveBeenCalled();
    });
});
