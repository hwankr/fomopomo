import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signUp: vi.fn(), signInWithPassword: vi.fn() } },
}));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

import ConfirmModal from '@/components/ConfirmModal';
import LoginModal from '@/components/LoginModal';
import AppSelect from '../AppSelect';
import DatePicker from '../DatePicker';
import ModalDialog from '../ModalDialog';

// 브라우저처럼: keydown이 막히지 않았을 때만 Space가 버튼을 누른다.
function pressSpace(element: HTMLElement) {
  if (fireEvent.keyDown(element, { key: ' ', code: 'Space' })) {
    fireEvent.keyUp(element, { key: ' ', code: 'Space' });
    fireEvent.click(element);
  }
}

function ConfirmHarness({ isDangerous = true, onConfirm = vi.fn() }: { isDangerous?: boolean; onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>계정 초기화</button>
      <button type="button">배경 버튼</button>
      <ConfirmModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
        title="계정 초기화"
        message="되돌릴 수 없어요."
        confirmText="초기화"
        isDangerous={isDangerous}
      />
    </>
  );
}

function openWithKeyboard(name: string) {
  const opener = screen.getByRole('button', { name });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe('ModalDialog via ConfirmModal', () => {
  afterEach(() => cleanup());

  it('focuses the safe action of a destructive confirmation and keeps Tab inside', () => {
    render(<ConfirmHarness />);
    openWithKeyboard('계정 초기화');

    const dialog = screen.getByRole('alertdialog', { name: '계정 초기화' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('되돌릴 수 없어요.');
    const cancel = screen.getByRole('button', { name: '취소' });
    const confirm = screen.getByRole('button', { name: '초기화' });
    expect(cancel).toHaveFocus();

    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(cancel).toHaveFocus();
  });

  it('focuses the confirm action when it is not destructive', () => {
    render(<ConfirmHarness isDangerous={false} />);
    openWithKeyboard('계정 초기화');

    expect(screen.getByRole('button', { name: '초기화' })).toHaveFocus();
  });

  it('makes the background inert, closes on Escape and returns focus to the opener', () => {
    const onConfirm = vi.fn();
    const { container } = render(<ConfirmHarness onConfirm={onConfirm} />);
    const opener = openWithKeyboard('계정 초기화');

    // 대화상자는 body로 포털되고, 페이지 쪽은 inert가 된다.
    const dialog = screen.getByRole('alertdialog');
    expect(container.contains(dialog)).toBe(false);
    expect(container).toHaveAttribute('inert');

    fireEvent.keyDown(screen.getByRole('button', { name: '취소' }), { key: 'Escape' });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(container).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();
  });

  it('returns focus to the opener after confirming', () => {
    const onConfirm = vi.fn();
    render(<ConfirmHarness onConfirm={onConfirm} />);
    const opener = openWithKeyboard('계정 초기화');

    fireEvent.click(screen.getByRole('button', { name: '초기화' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('keeps keys inside the dialog away from window shortcuts', () => {
    const windowKeyDown = vi.fn((event: KeyboardEvent) => {
      if (event.code === 'Space') event.preventDefault();
    });
    window.addEventListener('keydown', windowKeyDown);
    try {
      const onConfirm = vi.fn();
      render(<ConfirmHarness onConfirm={onConfirm} />);
      openWithKeyboard('계정 초기화');

      pressSpace(screen.getByRole('button', { name: '초기화' }));

      expect(windowKeyDown).not.toHaveBeenCalled();
      expect(onConfirm).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', windowKeyDown);
    }
  });
});

describe('ConfirmModal tone', () => {
  afterEach(() => cleanup());

  const renderTone = (props: Partial<Parameters<typeof ConfirmModal>[0]>) =>
    render(
      <ConfirmModal
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="그룹 나가기"
        message="다시 참여할 수 있어요."
        confirmText="나가기"
        {...props}
      />,
    );

  it.each([
    [{}, 'bg-ink', '나가기'],
    [{ confirmTone: 'ink' as const }, 'bg-ink', '나가기'],
    [{ confirmTone: 'pomo' as const }, 'bg-pomo', '나가기'],
    [{ confirmTone: 'danger' as const }, 'bg-pomo-deep', '취소'],
    [{ isDangerous: true }, 'bg-pomo-deep', '취소'],
    [{ isDangerous: true, confirmTone: 'pomo' as const }, 'bg-pomo', '나가기'],
  ])('maps %o to %s and focuses %s first', (props, fillClass, focused) => {
    renderTone(props);

    const confirm = screen.getByRole('button', { name: '나가기' });
    expect(confirm).toHaveClass(fillClass);
    for (const other of ['bg-ink', 'bg-pomo', 'bg-pomo-deep'].filter((name) => name !== fillClass)) {
      expect(confirm).not.toHaveClass(other);
    }
    expect(screen.getByRole('button', { name: focused })).toHaveFocus();
  });
});

describe('ModalDialog stacking', () => {
  afterEach(() => cleanup());

  function Stack({ onOuterClose, onInnerClose }: { onOuterClose: () => void; onInnerClose: () => void }) {
    const [innerOpen, setInnerOpen] = useState(false);
    return (
      <ModalDialog open onClose={onOuterClose} aria-label="바깥 대화상자">
        <button type="button" onClick={() => setInnerOpen(true)}>확인 열기</button>
        <ConfirmModal
          isOpen={innerOpen}
          onClose={() => { onInnerClose(); setInnerOpen(false); }}
          onConfirm={vi.fn()}
          title="정말 지울까요?"
          message="되돌릴 수 없어요."
          isDangerous
        />
      </ModalDialog>
    );
  }

  it('closes only the topmost dialog on Escape and restores focus inside the one below', () => {
    const onOuterClose = vi.fn();
    const onInnerClose = vi.fn();
    render(<Stack onOuterClose={onOuterClose} onInnerClose={onInnerClose} />);

    const outer = screen.getByRole('dialog', { name: '바깥 대화상자' });
    const opener = screen.getByRole('button', { name: '확인 열기' });
    expect(opener).toHaveFocus();
    fireEvent.click(opener);
    expect(screen.getByRole('alertdialog', { name: '정말 지울까요?' })).toBeInTheDocument();
    // 위 대화상자가 열린 동안 아래 대화상자도 배경이 된다.
    expect(outer.parentElement).toHaveAttribute('inert');

    fireEvent.keyDown(screen.getByRole('button', { name: '취소' }), { key: 'Escape' });

    expect(onInnerClose).toHaveBeenCalledTimes(1);
    expect(onOuterClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(outer.parentElement).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();

    fireEvent.keyDown(opener, { key: 'Escape' });
    expect(onOuterClose).toHaveBeenCalledTimes(1);
  });

  it('leaves Escape to an inner layer that already handled it', () => {
    const onClose = vi.fn();
    render(
      <ModalDialog open onClose={onClose} aria-label="필드가 있는 대화상자">
        <input aria-label="검색" onKeyDown={(event) => { if (event.key === 'Escape') event.preventDefault(); }} />
      </ModalDialog>,
    );

    const input = screen.getByRole('textbox', { name: '검색' });
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('focuses the panel itself when it has nothing focusable', () => {
    render(<ModalDialog open onClose={vi.fn()} aria-label="안내"><p>내용</p></ModalDialog>);

    const dialog = screen.getByRole('dialog', { name: '안내' });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog).toHaveFocus();
  });
});

describe('ModalDialog via LoginModal', () => {
  afterEach(() => cleanup());

  function LoginHarness({ onGoogleLogin = vi.fn() }: { onGoogleLogin?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>로그인</button>
        <LoginModal isOpen={open} onClose={() => setOpen(false)} onGoogleLogin={onGoogleLogin} />
      </>
    );
  }

  it('starts on the Google login, traps Tab, closes on Escape and restores focus', () => {
    const { container } = render(<LoginHarness />);
    const opener = openWithKeyboard('로그인');

    const dialog = screen.getByRole('dialog', { name: 'fomopomo 로그인' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(container).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: /Google로 계속하기/ })).toHaveFocus();

    const close = screen.getByRole('button', { name: '로그인 창 닫기' });
    const signUpToggle = screen.getByRole('button', { name: '회원가입' });
    act(() => close.focus());
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(signUpToggle).toHaveFocus();
    fireEvent.keyDown(signUpToggle, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('textbox', { name: '이메일' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(container).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();
  });

  it('keeps the existing Google login callback', () => {
    const onGoogleLogin = vi.fn();
    render(<LoginHarness onGoogleLogin={onGoogleLogin} />);
    openWithKeyboard('로그인');

    fireEvent.click(screen.getByRole('button', { name: /Google로 계속하기/ }));
    expect(onGoogleLogin).toHaveBeenCalledTimes(1);
  });
});

// 공통 선택 컨트롤이 대화상자의 처음·마지막 Tab 위치에 올 때(F5 회귀).
describe('ModalDialog with shared select and date controls', () => {
  afterEach(() => cleanup());

  const afterEventDispatch = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

  function Fields({ onClose, onlySelect = false }: { onClose: () => void; onlySelect?: boolean }) {
    const [subject, setSubject] = useState('a');
    const [date, setDate] = useState('2026-10-20');
    return (
      <ModalDialog open onClose={onClose} aria-label="기록 편집">
        <AppSelect
          aria-label="과목"
          value={subject}
          onValueChange={setSubject}
          options={[{ value: 'a', label: '영어' }, { value: 'b', label: '통계' }]}
        />
        {onlySelect ? null : (
          <>
            <button type="button">가운데</button>
            <DatePicker label="공부 날짜" value={date} onChange={setDate} />
          </>
        )}
      </ModalDialog>
    );
  }

  const selectTrigger = () => screen.getByRole('combobox', { name: '과목' });
  const dateTrigger = () => screen.getByRole('button', { name: '공부 날짜' });

  it('keeps Tab and Shift+Tab inside when the select and date triggers are the first and last stops', () => {
    render(<Fields onClose={vi.fn()} />);
    expect(selectTrigger()).toHaveFocus();

    fireEvent.keyDown(selectTrigger(), { key: 'Tab', shiftKey: true });
    expect(dateTrigger()).toHaveFocus();
    fireEvent.keyDown(dateTrigger(), { key: 'Tab' });
    expect(selectTrigger()).toHaveFocus();
  });

  it('keeps focus on a select that is the only stop', () => {
    render(<Fields onClose={vi.fn()} onlySelect />);

    // fireEvent가 false를 돌려주면 대화상자가 브라우저의 기본 포커스 이동(밖으로 나가기)을 막은 것이다.
    expect(fireEvent.keyDown(selectTrigger(), { key: 'Tab' })).toBe(false);
    expect(selectTrigger()).toHaveFocus();
    expect(fireEvent.keyDown(selectTrigger(), { key: 'Tab', shiftKey: true })).toBe(false);
    expect(selectTrigger()).toHaveFocus();
  });

  it('closes on Escape from a closed select trigger or date trigger', () => {
    const onClose = vi.fn();
    const { unmount } = render(<Fields onClose={onClose} />);
    fireEvent.keyDown(selectTrigger(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    const onDateClose = vi.fn();
    render(<Fields onClose={onDateClose} />);
    act(() => dateTrigger().focus());
    fireEvent.keyDown(dateTrigger(), { key: 'Escape' });
    expect(onDateClose).toHaveBeenCalledTimes(1);
  });

  it('closes only the open select list on the first Escape and the dialog on the next', async () => {
    const onClose = vi.fn();
    render(<Fields onClose={onClose} />);

    fireEvent.keyDown(selectTrigger(), { key: 'ArrowDown' });
    const listbox = await screen.findByRole('listbox');
    fireEvent.keyDown(within(listbox).getByRole('option', { name: '통계' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await afterEventDispatch();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '기록 편집' })).toBeInTheDocument();

    fireEvent.keyDown(selectTrigger(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes only the open calendar on the first Escape and the dialog on the next', async () => {
    const onClose = vi.fn();
    render(<Fields onClose={onClose} />);

    fireEvent.click(dateTrigger());
    const calendar = await screen.findByRole('dialog', { name: '공부 날짜 달력' });
    const day = within(calendar).getByRole('button', { name: /^2026년 10월 20일 / });
    await waitFor(() => expect(day).toHaveFocus());
    fireEvent.keyDown(day, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '공부 날짜 달력' })).not.toBeInTheDocument());
    await afterEventDispatch();
    expect(onClose).not.toHaveBeenCalled();
    expect(dateTrigger()).toHaveFocus();

    fireEvent.keyDown(dateTrigger(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('still closes when a descendant stops Escape without using it, but not when it uses it', async () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <ModalDialog open onClose={onClose} aria-label="막는 자식">
        <button type="button" onKeyDown={(event) => event.stopPropagation()}>전파만 막음</button>
      </ModalDialog>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: '전파만 막음' }), { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    unmount();

    const onKeepOpen = vi.fn();
    render(
      <ModalDialog open onClose={onKeepOpen} aria-label="쓰는 자식">
        <input
          aria-label="메모"
          onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') event.preventDefault(); }}
        />
      </ModalDialog>,
    );
    fireEvent.keyDown(screen.getByRole('textbox', { name: '메모' }), { key: 'Escape' });
    await afterEventDispatch();
    expect(onKeepOpen).not.toHaveBeenCalled();
  });
});
