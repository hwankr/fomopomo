import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
