import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/hooks/useStudySubjects', () => ({
  useStudySubjects: () => ({ subjects: [], createSubject: vi.fn() }),
}));

import TaskSidebar from '../TaskSidebar';
import { guardClosingPopovers } from '@/components/ui/popoverExit';
import type { LongTermTaskItem, TaskItem } from '../timer/hooks/useTasks';

// 작업 선택기는 닫혀도 붙어 있어 공통 퇴장 애니메이션이 돈다(docs/design-system.md §8).
// happy-dom은 CSS 애니메이션을 돌리지 않으므로 퇴장이 도는 것처럼 꾸미고, 끝나는 시점은 테스트가 정한다.

const makeTask = (over: Partial<TaskItem> & { id: string; title: string }): TaskItem => ({
  status: 'todo',
  durationSeconds: 0,
  kind: 'daily',
  ...over,
});

const TASKS = [makeTask({ id: 'a', title: '작업 A' }), makeTask({ id: 'b', title: '작업 B' })];
const LONG_TERM: LongTermTaskItem[] = [{
  id: 'p', title: '졸업 논문', subject_id: null, position: 0,
  subtasks: [{ id: 's1', title: '챕터1', position: 0, completed_at: null }],
}];

const flush = () => act(async () => {});
// Radix는 바깥 누름 감지를 setTimeout 0 뒤에 붙이고, 내린 뒤의 포커스 복귀도 setTimeout 0에 한다.
const flushTimers = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

type HarnessProps = Partial<Parameters<typeof TaskSidebar>[0]> & { onSelect?: (task: TaskItem | null) => void };

function PickerHarness({ onSelect = () => {}, ...over }: HarnessProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? 'picker' : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        지금 하는 일
      </button>
      <button type="button">다른 버튼</button>
      <TaskSidebar
        isOpen={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        contentId="picker"
        tasks={TASKS}
        longTermTasks={LONG_TERM}
        selectedTaskId={null}
        onSelectTask={onSelect}
        onToggleTask={() => {}}
        onSelectSubtask={async () => null}
        onSelectLongTermTask={async () => null}
        onToggleSubtask={() => {}}
        {...over}
      />
    </>
  );
}

const anchor = () => screen.getByRole('button', { name: '지금 하는 일' });
const picker = () => document.getElementById('picker');
const rowsWithEnter = () => Array.from(picker()!.querySelectorAll('.animate-fade-up'));

async function openPicker() {
  fireEvent.click(anchor());
  await flushTimers();
  return picker()!;
}

const endExit = (element: HTMLElement) => act(async () => {
  const event = new Event('animationend', { bubbles: true });
  Object.defineProperty(event, 'animationName', { value: 'ui-scale-out' });
  element.dispatchEvent(event);
  await new Promise((resolve) => setTimeout(resolve, 20));
});

describe('TaskSidebar desktop popover exit', () => {
  const realGetComputedStyle = window.getComputedStyle;
  let stopGuard: (() => void) | null = null;

  beforeEach(() => {
    // 닫힌 .ui-popover에 퇴장 애니메이션이 걸린 것처럼 Radix Presence에 알린다.
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
  });

  afterEach(() => {
    stopGuard?.();
    stopGuard = null;
    cleanup();
    vi.restoreAllMocks();
  });

  it('stays mounted, closed and inert while it fades, returns focus to the button once and keeps a later focus', async () => {
    stopGuard = guardClosingPopovers();
    const onSelect = vi.fn();
    render(<PickerHarness onSelect={onSelect} />);
    const content = await openPicker();
    expect(content).toHaveAttribute('data-state', 'open');
    expect(anchor()).toHaveAttribute('aria-controls', 'picker');
    expect(screen.getByRole('button', { name: /작업 A/ })).toHaveFocus();

    const focusSpy = vi.spyOn(anchor(), 'focus');
    fireEvent.click(screen.getByRole('button', { name: /작업 B/ }));
    await flush();

    expect(onSelect).toHaveBeenCalledWith(TASKS[1]);
    expect(picker()).toBe(content);
    expect(content).toHaveAttribute('data-state', 'closed');
    expect(content).toHaveAttribute('inert');
    expect(anchor()).toHaveFocus();
    expect(focusSpy).toHaveBeenCalledTimes(1);

    // 퇴장하는 동안 옮긴 포커스는 내용이 내려간 뒤에도 그대로다(onCloseAutoFocus가 빼앗지 않는다).
    const other = screen.getByRole('button', { name: '다른 버튼' });
    act(() => other.focus());
    await endExit(content);
    await flushTimers();
    expect(picker()).toBeNull();
    expect(other).toHaveFocus();
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('still returns focus to the button after the exit when no guard runs (unit tests, other hosts)', async () => {
    render(<PickerHarness />);
    const content = await openPicker();
    fireEvent.keyDown(screen.getByRole('button', { name: /작업 A/ }), { key: 'Escape' });
    await flush();
    expect(content).toHaveAttribute('data-state', 'closed');

    await endExit(content);
    await flushTimers();
    expect(picker()).toBeNull();
    expect(anchor()).toHaveFocus();
  });

  it('leaves focus where an outside press put it', async () => {
    stopGuard = guardClosingPopovers();
    render(<PickerHarness />);
    const content = await openPicker();
    const focusSpy = vi.spyOn(anchor(), 'focus');
    const other = screen.getByRole('button', { name: '다른 버튼' });

    fireEvent.pointerDown(other, { button: 0, pointerType: 'mouse' });
    act(() => other.focus());
    fireEvent.click(other);
    await flush();
    expect(content).toHaveAttribute('data-state', 'closed');
    expect(other).toHaveFocus();

    await endExit(content);
    await flushTimers();
    expect(picker()).toBeNull();
    expect(other).toHaveFocus();
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('moves focus back into the list when reopened during the exit', async () => {
    stopGuard = guardClosingPopovers();
    render(<PickerHarness />);
    const content = await openPicker();
    fireEvent.keyDown(screen.getByRole('button', { name: /작업 A/ }), { key: 'Escape' });
    await flush();
    expect(anchor()).toHaveFocus();

    fireEvent.click(anchor());
    await flush();
    expect(picker()).toBe(content);
    expect(content).toHaveAttribute('data-state', 'open');
    expect(content).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: /작업 A/ })).toHaveFocus();
  });
});

describe('TaskSidebar row motion', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lets the rows present at opening rise in order, then stops at the next action', async () => {
    const onToggleTask = vi.fn();
    render(<PickerHarness onToggleTask={onToggleTask} />);
    await openPicker();

    const rows = rowsWithEnter();
    const titles = ['작업 A', '작업 B', '졸업 논문'];
    expect(rows.map((row) => titles.find((title) => row.textContent?.startsWith(title)))).toEqual(titles);
    expect(rows.map((row) => (row as HTMLElement).style.getPropertyValue('--stagger-index'))).toEqual(['0', '1', '2']);
    expect(rows[0].parentElement).toHaveClass('ui-stagger');

    // 체크하면 그 원의 체크 표시만 튀어나오고, 열 때의 등장 표시는 지운다(완료한 행이 아래로 옮겨도 다시 돌지 않는다).
    fireEvent.click(screen.getByRole('checkbox', { name: '작업 A 완료' }));
    expect(onToggleTask).toHaveBeenCalledWith(TASKS[0]);
    expect(rowsWithEnter()).toHaveLength(0);
  });

  it('pops the check mark only for the circle the user just checked', () => {
    const tasks = [makeTask({ id: 'a', title: '작업 A' }), makeTask({ id: 'c', title: '끝낸 작업', status: 'done' })];
    const props = {
      isOpen: true, onClose: () => {}, selectedTaskId: null, onSelectTask: () => {}, onToggleTask: () => {},
      onSelectSubtask: async () => null, onSelectLongTermTask: async () => null, onToggleSubtask: () => {},
    };
    const view = render(<TaskSidebar {...props} tasks={tasks} />);
    const checkMark = (name: string) => screen.getByRole('checkbox', { name }).parentElement!.querySelector('svg');
    // 이미 끝낸 작업의 체크 표시는 열 때 움직이지 않는다.
    expect(checkMark('끝낸 작업 완료')).not.toHaveClass('animate-pop-in');

    fireEvent.click(screen.getByRole('checkbox', { name: '작업 A 완료' }));
    view.rerender(<TaskSidebar {...props} tasks={[{ ...tasks[0], status: 'done' }, tasks[1]]} />);
    expect(checkMark('작업 A 완료')).toHaveClass('animate-pop-in');
    expect(checkMark('끝낸 작업 완료')).not.toHaveClass('animate-pop-in');
  });

  it('lets the expanded chapters rise when a project is opened', async () => {
    render(<PickerHarness />);
    await openPicker();
    fireEvent.click(screen.getByRole('button', { name: /졸업 논문/, expanded: false }));
    const chapter = screen.getByRole('button', { name: '챕터1' });
    expect(chapter.closest('.pl-5')).toHaveClass('animate-fade-up');
    // 펼치기도 다음 동작이라 열 때의 등장 표시는 지운다.
    expect(rowsWithEnter().filter((element) => !element.classList.contains('pl-5'))).toHaveLength(0);
  });

  it('lets only the task just added rise, right away', async () => {
    const created = makeTask({ id: 'new', title: '새 작업' });
    const onCreateTask = vi.fn().mockResolvedValue(created);
    const props = {
      isOpen: true, onClose: () => {}, selectedTaskId: null, onSelectTask: () => {}, onToggleTask: () => {},
      onSelectSubtask: async () => null, onSelectLongTermTask: async () => null, onToggleSubtask: () => {},
      userId: 'user-1', onCreateTask,
    };
    const view = render(<TaskSidebar {...props} tasks={TASKS} />);
    fireEvent.click(screen.getByRole('button', { name: '작업 추가' }));
    fireEvent.change(screen.getByLabelText('새 작업 이름'), { target: { value: '새 작업' } });
    await act(async () => { fireEvent.submit(screen.getByRole('form', { name: '작업 추가' })); });
    view.rerender(<TaskSidebar {...props} tasks={[...TASKS, created]} />);

    const added = screen.getByRole('button', { name: /새 작업/ }).closest('li')!;
    expect(added).toHaveClass('animate-fade-up');
    expect(added.style.getPropertyValue('--stagger-index')).toBe('0');
    expect(within(added.parentElement!).getAllByRole('listitem').filter((row) => row.classList.contains('animate-fade-up')))
      .toEqual([added]);
  });
});

describe('TaskSidebar mobile sheet exit', () => {
  const originalMatchMedia = window.matchMedia;
  const running: Array<() => void> = [];

  beforeEach(() => {
    running.length = 0;
    window.matchMedia = ((query: string) => ({
      ...originalMatchMedia(query), matches: false,
      addEventListener: () => {}, removeEventListener: () => {},
    })) as typeof window.matchMedia;
    // ModalDialog는 닫힌 덮개에서 도는 애니메이션이 끝날 때까지 남는다.
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
              playState: 'running', currentTime: 0, finished,
              effect: { getTiming: () => ({ iterations: 1, duration: 200, delay: 0 }), getComputedTiming: () => ({ endTime: 200 }) },
            };
          });
      },
    });
  });

  afterEach(() => {
    cleanup();
    window.matchMedia = originalMatchMedia;
    delete (Element.prototype as { getAnimations?: unknown }).getAnimations;
  });

  it('keeps the sheet for its slide-out, gives focus back at once and has no row stagger', async () => {
    render(<PickerHarness />);
    const opener = anchor();
    opener.focus();
    fireEvent.click(opener);
    const sheet = screen.getByRole('dialog', { name: '작업 목록' });
    expect(document.getElementById('picker')).not.toBeNull();
    expect(sheet.querySelectorAll('.animate-fade-up')).toHaveLength(0);

    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
    const overlay = document.querySelector('.ui-dialog-overlay');
    expect(overlay).toHaveAttribute('data-state', 'closed');
    expect(overlay).toHaveAttribute('inert');
    expect(sheet).not.toHaveAttribute('aria-modal');
    expect(opener).toHaveFocus();

    await act(async () => { running.splice(0).forEach((finish) => finish()); });
    expect(document.querySelector('.ui-dialog-overlay')).toBeNull();
  });
});
