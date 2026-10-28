import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as Popover from '@radix-ui/react-popover';
import * as Select from '@radix-ui/react-select';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppSelect from '../AppSelect';
import ModalDialog from '../ModalDialog';
import { guardClosingPopovers, releaseFocus } from '../popoverExit';

const flush = () => act(async () => {});
// Radix FocusScope는 내용을 내린 뒤 setTimeout 0에 포커스를 다시 옮긴다. 그것까지 지나가게 한다.
const flushTimers = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const UNMOUNT_AUTOFOCUS_EVENT = 'focusScope.autoFocusOnUnmount';
// Radix가 내용을 내린 뒤 보내는 이벤트를 흉내 낸다. 가드가 취소했으면 true.
const unmountFocusCancelled = (element: Element) => {
  const event = new CustomEvent(UNMOUNT_AUTOFOCUS_EVENT, { bubbles: false, cancelable: true });
  element.dispatchEvent(event);
  return event.defaultPrevented;
};

describe('guardClosingPopovers on plain markup', () => {
  let stop: () => void;

  beforeEach(() => {
    document.body.innerHTML = `
      <button id="trigger" aria-controls="content">열기</button>
      <button id="elsewhere">다른 곳</button>
      <div class="ui-popover" id="content" data-state="open"><a href="#" id="link">링크</a></div>`;
    stop = guardClosingPopovers();
  });

  afterEach(() => {
    stop();
    document.body.innerHTML = '';
  });

  const content = () => document.getElementById('content')!;

  it('makes closing content inert and returns focus to the trigger at the moment of close', async () => {
    document.getElementById('link')!.focus();
    content().setAttribute('data-state', 'closed');
    await flush();

    expect(content()).toHaveAttribute('inert');
    expect(document.getElementById('trigger')).toHaveFocus();
  });

  it('does not pull focus to the trigger when an outside press closed it', async () => {
    document.getElementById('link')!.focus();
    fireEvent.pointerDown(document.getElementById('elsewhere')!);
    content().setAttribute('data-state', 'closed');
    await flush();

    expect(content()).toHaveAttribute('inert');
    expect(document.getElementById('trigger')).not.toHaveFocus();
    expect(document.getElementById('link')).not.toHaveFocus();
  });

  it('leaves focus alone when it was not inside, and lets content that reopens take focus again', async () => {
    document.getElementById('elsewhere')!.focus();
    content().setAttribute('data-state', 'closed');
    await flush();
    expect(document.getElementById('elsewhere')).toHaveFocus();

    content().setAttribute('data-state', 'open');
    await flush();
    expect(content()).not.toHaveAttribute('inert');
  });

  it('returns focus to the trigger once when content without an exit disappears with it (select list)', async () => {
    const closed = content();
    document.getElementById('link')!.focus();
    closed.setAttribute('data-state', 'closed');
    closed.remove();
    await flush();

    expect(document.getElementById('trigger')).toHaveFocus();
    // Radix가 나중에 트리거로 다시 옮기는 포커스는 취소한다(그새 옮긴 포커스를 지킨다).
    expect(unmountFocusCancelled(closed)).toBe(true);
  });

  it('leaves the focus of a select list closed by an outside press to Radix', async () => {
    const closed = content();
    document.getElementById('link')!.focus();
    fireEvent.pointerDown(document.getElementById('elsewhere')!);
    closed.setAttribute('data-state', 'closed');
    closed.remove();
    await flush();

    expect(document.getElementById('trigger')).not.toHaveFocus();
    expect(unmountFocusCancelled(closed)).toBe(false);
  });

  it('only lets go of the focus inside content that turned focus return off', async () => {
    content().setAttribute('data-close-autofocus', 'off');
    document.getElementById('link')!.focus();
    content().setAttribute('data-state', 'closed');
    await flush();

    expect(content()).toHaveAttribute('inert');
    expect(document.getElementById('trigger')).not.toHaveFocus();
    expect(content()).not.toContainElement(document.activeElement as HTMLElement | null);
    expect(unmountFocusCancelled(content())).toBe(true);
  });

  it('guards popovers that are added later', async () => {
    const late = document.createElement('div');
    late.innerHTML = '<div class="ui-popover" id="late" data-state="open"><button id="inner">안</button></div>';
    document.body.appendChild(late);
    await flush();
    document.getElementById('inner')!.focus();
    document.getElementById('late')!.setAttribute('data-state', 'closed');
    await flush();

    expect(document.getElementById('late')).toHaveAttribute('inert');
    expect(document.getElementById('inner')).not.toHaveFocus();
  });
});

describe('guardClosingPopovers cleanup', () => {
  const markup = `
    <button id="trigger" aria-controls="content">열기</button>
    <div class="ui-popover" id="content" data-state="open"><a href="#" id="link">링크</a></div>`;
  const content = () => document.getElementById('content')!;
  const close = async () => {
    document.getElementById('link')!.focus();
    content().setAttribute('data-state', 'closed');
    await flush();
  };

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('undoes what it changed on closing content when it is stopped', async () => {
    document.body.innerHTML = markup;
    const stop = guardClosingPopovers();
    await close();
    expect(content()).toHaveAttribute('inert');

    stop();

    expect(content()).not.toHaveAttribute('inert');
    expect(unmountFocusCancelled(content())).toBe(false);
  });

  it('works for open → close → reopen from a fresh module instance installed after the old one is stopped (HMR)', async () => {
    document.body.innerHTML = markup;
    const stopOld = guardClosingPopovers();
    await close();
    stopOld();

    vi.resetModules();
    const fresh = await import('../popoverExit');
    expect(fresh.guardClosingPopovers).not.toBe(guardClosingPopovers);
    const stop = fresh.guardClosingPopovers();
    try {
      // 아직 닫히는 중인 내용은 새 가드가 이어받는다.
      expect(content()).toHaveAttribute('inert');

      content().setAttribute('data-state', 'open');
      await flush();
      expect(content()).not.toHaveAttribute('inert');
      expect(unmountFocusCancelled(content())).toBe(false);

      await close();
      expect(content()).toHaveAttribute('inert');
      expect(document.getElementById('trigger')).toHaveFocus();
      expect(unmountFocusCancelled(content())).toBe(true);

      content().setAttribute('data-state', 'open');
      await flush();
      expect(content()).not.toHaveAttribute('inert');
      expect(unmountFocusCancelled(content())).toBe(false);
    } finally {
      stop();
    }
  });
});

describe('releaseFocus', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('moves focus out of a container to a target, or just lets go', () => {
    document.body.innerHTML = '<button id="t">t</button><div id="c"><button id="in">in</button></div>';
    const container = document.getElementById('c')!;
    document.getElementById('in')!.focus();
    expect(releaseFocus(container, document.getElementById('t'))).toBe(true);
    expect(document.getElementById('t')).toHaveFocus();

    expect(releaseFocus(container, null)).toBe(false);
    document.getElementById('in')!.focus();
    releaseFocus(container);
    expect(document.getElementById('in')).not.toHaveFocus();
  });
});

// docs/design-system.md §8의 ui-collapse 예제: 접히기 시작하면 바로 inert, 안에 있던 포커스는 트리거로.
describe('collapse pattern', () => {
  afterEach(() => cleanup());

  function Details() {
    const [open, setOpen] = useState(true);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const toggle = () => {
      if (open && panelRef.current) releaseFocus(panelRef.current, triggerRef.current);
      setOpen(!open);
    };
    return (
      <>
        <button ref={triggerRef} type="button" aria-expanded={open} aria-controls="details" onClick={toggle}>세부 할 일</button>
        <div ref={panelRef} id="details" className="ui-collapse" data-state={open ? 'open' : 'closed'} inert={!open || undefined}>
          <div><button type="button" onClick={toggle}>접기</button></div>
        </div>
      </>
    );
  }

  it('stops taking focus as soon as it starts closing and hands focus to the trigger', () => {
    render(<Details />);
    const inner = screen.getByRole('button', { name: '접기' });
    act(() => inner.focus());

    fireEvent.click(inner);

    expect(document.getElementById('details')).toHaveAttribute('inert');
    expect(document.getElementById('details')).toHaveAttribute('data-state', 'closed');
    expect(screen.getByRole('button', { name: '세부 할 일' })).toHaveFocus();
  });
});

// 실제 Radix 팝오버로, 퇴장 애니메이션 동안(Presence가 내용을 남겨 둔 동안)의 동작을 본다.
describe('guardClosingPopovers with a Radix popover exit', () => {
  let stop: () => void;
  const realGetComputedStyle = window.getComputedStyle;

  beforeEach(() => {
    // happy-dom은 CSS를 읽지 않으므로, 닫힌 .ui-popover에 퇴장 애니메이션이 걸린 것처럼 Presence에 알린다.
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element, pseudo?: string | null) => {
      const style = realGetComputedStyle.call(window, element, pseudo);
      if (!element.classList?.contains('ui-popover')) return style;
      return new Proxy(style, {
        get(target, property) {
          if (property === 'animationName') {
            return element.getAttribute('data-state') === 'closed' ? 'ui-scale-out' : 'ui-scale-in';
          }
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
    stop = guardClosingPopovers();
  });

  afterEach(() => {
    stop();
    cleanup();
    vi.restoreAllMocks();
  });

  function Menu() {
    return (
      <>
        <Popover.Root>
          <Popover.Trigger>메뉴</Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className="ui-popover" aria-label="메뉴 내용">
              <button type="button">닉네임 수정</button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <button type="button">다음 버튼</button>
      </>
    );
  }

  const content = () => document.querySelector<HTMLElement>('.ui-popover');
  const endExit = (element: HTMLElement) => act(async () => {
    const event = new Event('animationend', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: 'ui-scale-out' });
    element.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it('returns focus to the trigger on Escape while the content fades out, and keeps a later Tab target', async () => {
    render(<Menu />);
    const trigger = screen.getByRole('button', { name: '메뉴' });
    fireEvent.click(trigger);
    await flush();
    const inner = screen.getByRole('button', { name: '닉네임 수정' });
    act(() => inner.focus());

    fireEvent.keyDown(inner, { key: 'Escape' });
    await flush();

    // 아직 붙어 있지만 닫혔다: 클릭·포커스를 받지 않고 포커스는 트리거에 있다.
    const closing = content()!;
    expect(closing).toHaveAttribute('data-state', 'closed');
    expect(closing).toHaveAttribute('inert');
    expect(trigger).toHaveFocus();

    // 퇴장 중에 다른 곳으로 옮긴 포커스는 퇴장이 끝난 뒤에도 그대로다.
    const next = screen.getByRole('button', { name: '다음 버튼' });
    act(() => next.focus());
    await endExit(closing);
    expect(content()).toBeNull();
    expect(next).toHaveFocus();
  });

  it('opens again right after closing', async () => {
    render(<Menu />);
    const trigger = screen.getByRole('button', { name: '메뉴' });
    fireEvent.click(trigger);
    await flush();
    act(() => screen.getByRole('button', { name: '닉네임 수정' }).focus());
    fireEvent.keyDown(screen.getByRole('button', { name: '닉네임 수정' }), { key: 'Escape' });
    await flush();
    expect(content()).toHaveAttribute('inert');

    fireEvent.click(trigger);
    await flush();

    expect(document.querySelectorAll('.ui-popover')).toHaveLength(1);
    expect(content()).toHaveAttribute('data-state', 'open');
    expect(content()).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: '닉네임 수정' })).toBeInTheDocument();
  });
});

// 실제 AppSelect를 실제 ModalDialog 안에서: 목록은 바로 내려가고, Radix의 지연된 포커스 복귀는 가드가 취소한다.
describe('guardClosingPopovers with AppSelect in a ModalDialog', () => {
  let stop: () => void;

  beforeEach(() => {
    stop = guardClosingPopovers();
  });

  afterEach(() => {
    stop();
    cleanup();
    vi.restoreAllMocks();
  });

  const options = [
    { value: 'database', label: '데이터베이스' },
    { value: 'blockchain', label: '블록체인' },
  ];

  function TaskDialog() {
    const [subject, setSubject] = useState('database');
    return (
      <ModalDialog open onClose={() => {}} aria-label="할 일 추가">
        <input aria-label="제목" />
        <AppSelect label="과목" value={subject} onValueChange={setSubject} options={options} />
      </ModalDialog>
    );
  }

  async function openSelect() {
    const trigger = screen.getByRole('combobox', { name: '과목' });
    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await screen.findByRole('listbox');
    await waitFor(() => expect(screen.getByRole('option', { name: '데이터베이스' })).toHaveFocus());
    return trigger;
  }

  const locked = () => document.body.style.pointerEvents === 'none' || document.body.hasAttribute('data-scroll-locked');

  it('keeps focus that moved to another input right after Escape', async () => {
    render(<TaskDialog />);
    await openSelect();
    expect(locked()).toBe(true);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await flush();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    const title = screen.getByRole('textbox', { name: '제목' });
    act(() => title.focus());
    await flushTimers();

    expect(title).toHaveFocus();
    expect(screen.getByRole('dialog', { name: '할 일 추가' })).toBeInTheDocument();
    expect(locked()).toBe(false);
  });

  it('returns focus to the trigger exactly once when an option is chosen', async () => {
    render(<TaskDialog />);
    const trigger = await openSelect();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    await waitFor(() => expect(screen.getByRole('option', { name: '블록체인' })).toHaveFocus());
    focus.mockClear();
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    await flushTimers();

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('블록체인');
    expect(trigger).toHaveFocus();
    expect(focus.mock.contexts.filter((element) => element === trigger)).toHaveLength(1);
    expect(locked()).toBe(false);
  });

  it('opens again right after closing without the old close pulling focus', async () => {
    render(<TaskDialog />);
    const trigger = await openSelect();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await flush();
    expect(trigger).toHaveFocus();

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    await screen.findByRole('listbox');
    await flushTimers();

    expect(screen.getAllByRole('listbox')).toHaveLength(1);
    expect(screen.getByRole('listbox')).toContainElement(document.activeElement as HTMLElement | null);
    expect(screen.getByRole('option', { name: '데이터베이스' })).toHaveFocus();
  });

  // Radix FocusScope가 지연된 포커스 이동 이벤트를 보내는 곳이 .ui-popover 자신인지(두 배치 방식 모두).
  it.each(['popper', 'item-aligned'] as const)('dispatches the delayed focus return on the .ui-popover itself (%s)', async (position) => {
    render(
      <Select.Root defaultValue="a">
        <Select.Trigger aria-label="배치">
          <Select.Value />
        </Select.Trigger>
        <Select.Portal>
          <Select.Content position={position} className="ui-popover">
            <Select.Viewport>
              <Select.Item value="a"><Select.ItemText>가</Select.ItemText></Select.Item>
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>,
    );
    const trigger = screen.getByRole('combobox', { name: '배치' });
    act(() => trigger.focus());
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const listbox = await screen.findByRole('listbox');
    expect(listbox).toHaveClass('ui-popover');
    const dispatch = vi.spyOn(listbox, 'dispatchEvent');

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await flushTimers();

    // happy-dom은 한 번 보낼 때 dispatchEvent를 안에서 다시 부르므로 이벤트 객체로 센다.
    const returns = [...new Set(dispatch.mock.calls.map(([event]) => event).filter((event) => event.type === UNMOUNT_AUTOFOCUS_EVENT))];
    expect(returns).toHaveLength(1);
    // 가드가 이미 트리거로 돌려줬으므로 Radix의 복귀는 취소됐다.
    expect(returns[0].defaultPrevented).toBe(true);
    expect(trigger).toHaveFocus();
  });
});
