import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signUp: vi.fn(), signInWithPassword: vi.fn() } },
}));

import ConfirmModal from '@/components/ConfirmModal';
import ModalDialog from '../ModalDialog';

// happy-dom은 CSS 애니메이션을 돌리지 않는다. 브라우저처럼 data-state="closed"인 덮개에서
// 퇴장 애니메이션이 도는 것처럼 꾸미고, 끝나는 시점은 테스트가 정한다.
const running: Array<() => void> = [];
const ORIGINAL_MATCH_MEDIA = window.matchMedia;

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

function Harness({ label = '편집' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>열기</button>
      <button type="button">배경 버튼</button>
      <ModalDialog open={open} onClose={() => setOpen(false)} aria-label={label}>
        <input aria-label="이름" />
        <button type="button" onClick={() => setOpen(false)}>닫기</button>
      </ModalDialog>
    </>
  );
}

function open(name = '열기') {
  const opener = screen.getByRole('button', { name });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe('ModalDialog exit lifecycle', () => {
  beforeEach(() => {
    running.length = 0;
  });

  afterEach(() => {
    cleanup();
    delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: ORIGINAL_MATCH_MEDIA });
  });

  it('marks the dialog as entering and unmounts at once when no exit animation runs', () => {
    const { container } = render(<Harness />);
    const opener = open();

    const dialog = screen.getByRole('dialog', { name: '편집' });
    expect(dialog).toHaveAttribute('data-state', 'open');
    expect(dialog.parentElement).toHaveAttribute('data-state', 'open');

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('.ui-dialog-overlay')).toBeNull();
    expect(container).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();
  });

  it('keeps a closing dialog until its exit animation ends, out of the way of the page', async () => {
    mockExitAnimations();
    const onKeyDown = vi.fn();
    const { container } = render(<Harness />);
    const opener = open();
    const dialog = screen.getByRole('dialog', { name: '편집' });

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    // 아직 붙어 있지만 닫히는 중이다: 클릭·포커스·보조기기에서 빠지고 열린 층으로 세지 않는다.
    const overlay = closingOverlay();
    expect(overlay).not.toBeNull();
    expect(overlay).toContainElement(dialog);
    expect(overlay).toHaveAttribute('inert');
    expect(dialog).toHaveAttribute('data-state', 'closed');
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    // 배경과 포커스는 닫히기 시작할 때 바로 돌려준다.
    expect(container).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();

    // 닫히는 대화상자는 Escape·Tab을 더 다루지 않는다.
    window.addEventListener('keydown', onKeyDown);
    try {
      expect(fireEvent.keyDown(opener, { key: 'Tab' })).toBe(true);
      fireEvent.keyDown(opener, { key: 'Escape' });
      expect(onKeyDown).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener('keydown', onKeyDown);
    }

    await finishExitAnimations();
    expect(document.querySelector('.ui-dialog-overlay')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('unmounts after a timeout when the exit animation never reports its end', async () => {
    mockExitAnimations();
    render(<Harness />);
    open();

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(closingOverlay()).not.toBeNull();

    await waitFor(() => expect(document.querySelector('.ui-dialog-overlay')).toBeNull(), { timeout: 1000 });
    expect(running).toHaveLength(1);
  });

  it('unmounts immediately with reduced motion even if an animation would run', () => {
    mockExitAnimations();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query.includes('prefers-reduced-motion'), media: query, addEventListener() {}, removeEventListener() {} }),
    });
    render(<Harness />);
    const opener = open();

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(document.querySelector('.ui-dialog-overlay')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('opens a fresh dialog when reopened during the exit, and the old exit does not close it', async () => {
    mockExitAnimations();
    const { container } = render(<Harness />);
    const opener = open();
    fireEvent.change(screen.getByRole('textbox', { name: '이름' }), { target: { value: '지난 입력' } });

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(closingOverlay()).not.toBeNull();
    open();

    const overlays = document.querySelectorAll('.ui-dialog-overlay');
    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toHaveAttribute('data-state', 'open');
    const input = screen.getByRole('textbox', { name: '이름' });
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(container).toHaveAttribute('inert');

    await finishExitAnimations();
    expect(screen.getByRole('dialog', { name: '편집' })).toHaveAttribute('data-state', 'open');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(closingOverlay()).not.toBeNull();
    await finishExitAnimations();
    expect(document.querySelector('.ui-dialog-overlay')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('keeps showing the last open content while the parent clears it on close', async () => {
    mockExitAnimations();
    function Record() {
      const [item, setItem] = useState<string | null>(null);
      return (
        <>
          <button type="button" onClick={() => setItem('통계 과제')}>열기</button>
          <ModalDialog open={item !== null} onClose={() => setItem(null)} aria-label="기록">
            <p>{item ?? '비어 있음'}</p>
            <button type="button" onClick={() => setItem(null)}>닫기</button>
          </ModalDialog>
        </>
      );
    }
    render(<Record />);
    open();

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(closingOverlay()).toHaveTextContent('통계 과제');
    expect(closingOverlay()).not.toHaveTextContent('비어 있음');
    await finishExitAnimations();
    expect(document.querySelector('.ui-dialog-overlay')).toBeNull();
  });

  it('hands the top-dialog role to the dialog below as soon as the top one starts closing', async () => {
    mockExitAnimations();
    const onOuterClose = vi.fn();
    function Stack() {
      const [innerOpen, setInnerOpen] = useState(false);
      return (
        <ModalDialog open onClose={onOuterClose} aria-label="바깥 대화상자">
          <button type="button" onClick={() => setInnerOpen(true)}>확인 열기</button>
          <ConfirmModal
            isOpen={innerOpen}
            onClose={() => setInnerOpen(false)}
            onConfirm={vi.fn()}
            title="정말 지울까요?"
            message="되돌릴 수 없어요."
            isDangerous
          />
        </ModalDialog>
      );
    }
    render(<Stack />);
    const outer = screen.getByRole('dialog', { name: '바깥 대화상자' });
    const opener = screen.getByRole('button', { name: '확인 열기' });
    fireEvent.click(opener);
    expect(outer.parentElement).toHaveAttribute('inert');

    fireEvent.keyDown(screen.getByRole('button', { name: '취소' }), { key: 'Escape' });

    // 위 대화상자는 아직 퇴장 중이지만, 아래 대화상자가 바로 맨 위가 된다.
    expect(closingOverlay()).not.toBeNull();
    expect(outer.parentElement).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();
    fireEvent.keyDown(opener, { key: 'Escape' });
    expect(onOuterClose).toHaveBeenCalledTimes(1);

    await finishExitAnimations();
    expect(closingOverlay()).toBeNull();
    expect(outer).toBeInTheDocument();
  });

  it('keeps the page inert and the original opener when one dialog closes as another opens', async () => {
    mockExitAnimations();
    // B를 A보다 앞에 두어 B가 먼저 열리고 A가 나중에 정리되는(어려운) 순서를 만든다.
    function Swap() {
      const [which, setWhich] = useState<'a' | 'b' | null>(null);
      return (
        <>
          <button type="button" onClick={() => setWhich('a')}>A 열기</button>
          <ModalDialog open={which === 'b'} onClose={() => setWhich(null)} aria-label="B">
            <button type="button" onClick={() => setWhich(null)}>B 닫기</button>
          </ModalDialog>
          <ModalDialog open={which === 'a'} onClose={() => setWhich(null)} aria-label="A">
            <button type="button" onClick={() => setWhich('b')}>B로</button>
          </ModalDialog>
        </>
      );
    }
    const { container } = render(<Swap />);
    const opener = open('A 열기');

    fireEvent.click(screen.getByRole('button', { name: 'B로' }));

    expect(screen.getByRole('button', { name: 'B 닫기' })).toHaveFocus();
    expect(container).toHaveAttribute('inert');
    await finishExitAnimations();
    expect(container).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'B 닫기' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'B 닫기' }));
    await finishExitAnimations();

    expect(document.querySelector('.ui-dialog-overlay')).toBeNull();
    expect(container).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();
  });
});
