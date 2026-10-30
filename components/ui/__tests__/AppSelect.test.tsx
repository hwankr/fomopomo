import { readFileSync } from 'node:fs';
import path from 'node:path';
import { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppSelect, { type AppSelectProps } from '../AppSelect';

afterEach(cleanup);

const options = [
  { value: '', label: '미분류' },
  { value: 'database', label: '데이터베이스' },
  { value: 'blockchain', label: '블록체인' },
];

function ControlledSelect({ onValueChange = () => {}, ...props }: Partial<AppSelectProps>) {
  const [value, setValue] = useState(props.value ?? 'database');
  return <AppSelect label="과목" options={options} {...props} value={value} onValueChange={next => {
    setValue(next);
    onValueChange(next);
  }} />;
}

async function openSelect(name = '과목') {
  const trigger = screen.getByRole('combobox', { name });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  await screen.findByRole('listbox');
  return trigger;
}

describe('AppSelect', () => {
  it('selects stable values with the keyboard and preserves an explicit empty option', async () => {
    const change = vi.fn();
    render(<ControlledSelect value="" onValueChange={change} />);
    expect(screen.getByRole('combobox', { name: '과목' })).toHaveTextContent('미분류');

    await openSelect();
    const unclassified = screen.getByRole('option', { name: '미분류' });
    await waitFor(() => expect(unclassified).toHaveFocus());
    fireEvent.keyDown(unclassified, { key: 'ArrowDown' });
    const database = screen.getByRole('option', { name: '데이터베이스' });
    await waitFor(() => expect(database).toHaveFocus());
    fireEvent.keyDown(database, { key: 'Enter' });
    expect(change).toHaveBeenLastCalledWith('database');
    expect(screen.getByRole('combobox', { name: '과목' })).toHaveTextContent('데이터베이스');

    await openSelect();
    fireEvent.click(screen.getByRole('option', { name: '미분류' }));
    expect(change).toHaveBeenLastCalledWith('');
    expect(screen.getByRole('combobox', { name: '과목' })).toHaveTextContent('미분류');
  });

  it('shows a placeholder when there is no explicit empty option', () => {
    render(<AppSelect value="" onValueChange={vi.fn()} options={options.slice(1)} placeholder="과목 선택" aria-label="기록 과목" />);
    expect(screen.getByRole('combobox', { name: '기록 과목' })).toHaveTextContent('과목 선택');
    expect(screen.getByRole('combobox')).toHaveAttribute('data-placeholder');
  });

  it('closes on Escape and restores focus without changing the value', async () => {
    const change = vi.fn();
    render(<ControlledSelect onValueChange={change} />);
    const trigger = await openSelect();
    await waitFor(() => expect(screen.getByRole('option', { name: '데이터베이스' })).toHaveFocus());
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(change).not.toHaveBeenCalled();
  });

  it('keeps Space selection from reaching global timer keyboard shortcuts', async () => {
    const shortcut = vi.fn();
    const change = vi.fn();
    window.addEventListener('keydown', shortcut);
    try {
      render(<ControlledSelect onValueChange={change} />);
      const trigger = screen.getByRole('combobox', { name: '과목' });
      trigger.focus();
      fireEvent.keyDown(trigger, { key: ' ' });
      const database = await screen.findByRole('option', { name: '데이터베이스' });
      await waitFor(() => expect(database).toHaveFocus());
      fireEvent.keyDown(database, { key: 'ArrowDown' });
      const blockchain = screen.getByRole('option', { name: '블록체인' });
      await waitFor(() => expect(blockchain).toHaveFocus());
      fireEvent.keyDown(blockchain, { key: ' ' });
      expect(change).toHaveBeenLastCalledWith('blockchain');
      expect(shortcut).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', shortcut);
    }
  });

  it('skips disabled options with arrow keys and supports typeahead', async () => {
    const change = vi.fn();
    render(<ControlledSelect value="" onValueChange={change} options={[
      options[0], { ...options[1], disabled: true }, options[2],
    ]} />);
    await openSelect();
    const unclassified = screen.getByRole('option', { name: '미분류' });
    await waitFor(() => expect(unclassified).toHaveFocus());
    expect(screen.getByRole('option', { name: '데이터베이스' })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(unclassified, { key: 'ArrowDown' });
    const blockchain = screen.getByRole('option', { name: '블록체인' });
    await waitFor(() => expect(blockchain).toHaveFocus());
    fireEvent.keyDown(blockchain, { key: '미' });
    await waitFor(() => expect(unclassified).toHaveFocus());
    expect(change).not.toHaveBeenCalled();
  });

  it('keeps disabled controls closed', () => {
    const change = vi.fn();
    render(<ControlledSelect disabled onValueChange={change} />);
    const trigger = screen.getByRole('combobox', { name: '과목' });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
  });

  it('dismisses on the first outside pointer press after interacting with its content', async () => {
    render(<ControlledSelect />);
    await openSelect();
    await waitFor(() => expect(screen.getByRole('option', { name: '데이터베이스' })).toHaveFocus());
    fireEvent.pointerDown(screen.getByRole('listbox'), { pointerType: 'mouse', button: 0 });
    fireEvent.pointerDown(document.body, { pointerType: 'mouse', button: 0 });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('does not bubble portalled option clicks into a parent modal or submit its form', async () => {
    const click = vi.fn();
    const submit = vi.fn(event => event.preventDefault());
    const change = vi.fn();
    render(<div onClick={click}><form onSubmit={submit}><ControlledSelect onValueChange={change} /></form></div>);
    const trigger = await openSelect();
    expect(trigger).toHaveAttribute('type', 'button');
    fireEvent.click(screen.getByRole('option', { name: '블록체인' }));
    expect(change).toHaveBeenLastCalledWith('blockchain');
    expect(click).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('AppSelect key boundary', () => {
  it('keeps the keys it uses from parent handlers and passes Escape and Tab on', async () => {
    const parentKeyDown = vi.fn();
    render(<div onKeyDown={event => parentKeyDown(event.key)}><ControlledSelect /></div>);
    const trigger = screen.getByRole('combobox', { name: '과목' });

    for (const key of ['Enter', ' ', 'ArrowUp', 'a']) fireEvent.keyDown(trigger, { key });
    expect(parentKeyDown).not.toHaveBeenCalled();

    fireEvent.keyDown(trigger, { key: 'Escape' });
    fireEvent.keyDown(trigger, { key: 'Tab' });
    expect(parentKeyDown.mock.calls.map(([key]) => key)).toEqual(['Escape', 'Tab']);

    // 열린 목록은 키보드를 가지므로 아무 키도 위로 보내지 않는다.
    await openSelect();
    parentKeyDown.mockClear();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Tab' });
    expect(parentKeyDown).not.toHaveBeenCalled();
  });
});

// 열린 목록은 페이지의 포인터 입력을 막는다(body pointer-events: none). 브라우저에서 본 터치 순서: 누름·뗌은 html에 닿고,
// 목록이 닫힌 뒤의 호환 mousedown·mouseup·click(detail 1)은 손가락 아래 요소로 간다. 마우스는 모두 html에 간다.
describe('AppSelect outside tap', () => {
  // Radix는 바깥 누름 처리기를 목록이 열린 뒤 setTimeout(0)으로 붙인다.
  const afterEventDispatch = () => act(() => new Promise(resolve => setTimeout(resolve, 20)));

  function Page({ withSelect = true }: { withSelect?: boolean }) {
    return (
      <div>
        {withSelect ? <ControlledSelect /> : null}
        <button type="button" onClick={() => pressed()}>아래 버튼</button>
      </div>
    );
  }
  const pressed = vi.fn();
  afterEach(() => pressed.mockReset());
  // 목록이 열려 있는 동안은 나머지가 aria-hidden이라 역할로 찾지 않는다.
  const below = () => screen.getByText('아래 버튼');

  async function openPage(ui = <Page />) {
    const view = render(ui);
    const trigger = await openSelect();
    await afterEventDispatch();
    return { ...view, trigger };
  }

  // 브라우저의 기본 동작처럼, 막히지 않은 mousedown은 그 요소에 포커스를 준다. click을 막았으면 false.
  function compatEvents(element: HTMLElement) {
    if (fireEvent.mouseDown(element, { detail: 1 })) element.focus();
    fireEvent.mouseUp(element, { detail: 1 });
    return fireEvent.click(element, { detail: 1 });
  }
  function pressPage(pointerType: string) {
    fireEvent.pointerDown(document.documentElement, { pointerType, pointerId: 7, button: 0 });
  }
  function releasePage(pointerType: string) {
    fireEvent.pointerUp(document.documentElement, { pointerType, pointerId: 7, button: 0 });
  }
  // 목록이 닫힌 뒤 다시 막히지 않은 페이지에서의 탭
  function tap(element: HTMLElement) {
    fireEvent.pointerDown(element, { pointerType: 'touch', pointerId: 8, button: 0 });
    fireEvent.pointerUp(element, { pointerType: 'touch', pointerId: 8, button: 0 });
    fireEvent.touchEnd(element);
    return compatEvents(element);
  }
  // 키보드 Enter로 누른 버튼은 detail 0인 click을 받는다.
  function pressEnter(element: HTMLElement) {
    fireEvent.keyDown(element, { key: 'Enter' });
    fireEvent.click(element, { detail: 0 });
    fireEvent.keyUp(element, { key: 'Enter' });
  }

  it.each(['touch', 'pen'])('closes only the list on an outside %s tap, like a mouse press there', async pointerType => {
    const { trigger } = await openPage();

    pressPage(pointerType);
    releasePage(pointerType);
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(fireEvent.touchEnd(document.documentElement)).toBe(false);
    expect(compatEvents(below())).toBe(false);
    await afterEventDispatch();
    expect(pressed).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();

    // 다음 탭은 그대로 누른다.
    expect(tap(below())).toBe(true);
    expect(pressed).toHaveBeenCalledTimes(1);
    expect(below()).toHaveFocus();
  });

  it('keeps the list closed when the tap lands on its own trigger', async () => {
    const { trigger } = await openPage();

    pressPage('touch');
    releasePage('touch');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    compatEvents(trigger);
    await afterEventDispatch();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // 닫힌 트리거를 다시 탭하면 열린다.
    tap(trigger);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  it('lets keyboard and programmatic clicks through while it waits for the tap', async () => {
    await openPage();
    pressPage('touch');
    releasePage('touch');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());

    act(() => below().click());
    pressEnter(below());
    expect(pressed).toHaveBeenCalledTimes(2);
    expect(compatEvents(below())).toBe(false);
    expect(pressed).toHaveBeenCalledTimes(2);
  });

  it('ends when the touch turns into a scroll', async () => {
    await openPage();
    pressPage('touch');
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(fireEvent.mouseDown(below(), { detail: 1 })).toBe(false);
    fireEvent.pointerCancel(document.documentElement, { pointerType: 'touch', pointerId: 7 });

    expect(compatEvents(below())).toBe(true);
    act(() => below().click());
    pressEnter(below());
    expect(pressed).toHaveBeenCalledTimes(3);
  });

  it('ends a short time after the finger lifts without a click', async () => {
    await openPage();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      pressPage('touch');
      releasePage('touch');
      act(() => vi.advanceTimersByTime(300));
      expect(fireEvent.mouseDown(below(), { detail: 1 })).toBe(false);
      act(() => vi.advanceTimersByTime(400));
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());

    expect(compatEvents(below())).toBe(true);
    act(() => below().click());
    pressEnter(below());
    expect(pressed).toHaveBeenCalledTimes(3);
  });

  it('leaves a mouse press alone', async () => {
    const { trigger } = await openPage();

    pressPage('mouse');
    fireEvent.mouseDown(document.documentElement, { detail: 1 });
    releasePage('mouse');
    fireEvent.mouseUp(document.documentElement, { detail: 1 });
    fireEvent.click(document.documentElement, { detail: 1 });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());

    // 다음 누름 없이 바로 와도 그대로 받는다.
    expect(fireEvent.click(below(), { detail: 1 })).toBe(true);
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  // 예: 목록이 열려 있어도 펼친 .ui-collapse 내용은 포인터를 받는다(globals.css). 마우스로 눌러도 그 요소가 받는다.
  it('leaves a tap alone when its press reached a real element', async () => {
    await openPage();

    expect(tap(below())).toBe(true);
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it('removes its listeners when it ends or the select unmounts, also under StrictMode', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const guardListeners = () => add.mock.calls.filter(([, , options]) =>
      typeof options === 'object' && options.capture === true && options.passive === false);
    const removed = (type: string, listener: unknown) =>
      remove.mock.calls.some(call => call[0] === type && call[1] === listener && call[2] === true);
    try {
      const { trigger, rerender } = await openPage(<StrictMode><Page /></StrictMode>);
      pressPage('touch');
      releasePage('touch');
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
      expect(compatEvents(below())).toBe(false);
      expect(guardListeners()).toHaveLength(7);
      expect(guardListeners().every(([type, listener]) => removed(type, listener))).toBe(true);

      // 탭을 기다리는 중에 선택 컨트롤이 사라져도 남지 않는다.
      tap(trigger);
      await screen.findByRole('listbox');
      await afterEventDispatch();
      pressPage('touch');
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
      rerender(<StrictMode><Page withSelect={false} /></StrictMode>);
      expect(guardListeners()).toHaveLength(14);
      expect(guardListeners().every(([type, listener]) => removed(type, listener))).toBe(true);
      releasePage('touch');
      expect(compatEvents(below())).toBe(true);
      expect(pressed).toHaveBeenCalledTimes(1);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });
});

// 열린 목록은 페이지 스크롤을 잠근다(react-remove-scroll). globals.css의 스크롤 잠금 보정은 그 잠금이 쓰는
// body 속성과 스크롤바 폭 변수에 기대므로, 이름이 바뀌면 고정 요소가 다시 흔들린다(실제 이동량은 브라우저에서 측정).
describe('AppSelect scroll lock', () => {
  const css = readFileSync(path.resolve(process.cwd(), 'app/globals.css'), 'utf8');
  const block = css.slice(css.indexOf('/* 스크롤 잠금 보정 */'), css.indexOf('/* 스크롤 잠금 보정 끝 */'));

  it('locks with the attribute and variable that keep fixed full-width elements in place', async () => {
    render(<ControlledSelect />);
    await openSelect();

    expect(document.body).toHaveAttribute('data-scroll-locked');
    const lockStyle = Array.from(document.head.querySelectorAll('style'))
      .map(style => style.textContent ?? '')
      .find(text => text.includes('body[data-scroll-locked]'));
    expect(lockStyle).toContain('--removed-body-scroll-bar-size:');

    expect(block).toMatch(
      /body\[data-scroll-locked\] :is\([^)]*\.ui-scroll-lock-fixed[^)]*\) \{\s*margin-right: var\(--removed-body-scroll-bar-size, 0px\);/,
    );
    for (const selector of ['.ui-dialog-overlay', '[data-dialog-keep] > div']) expect(block).toContain(selector);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(document.body).not.toHaveAttribute('data-scroll-locked'));
  });
});
