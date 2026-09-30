import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { toastMock } = vi.hoisted(() => ({
  toastMock: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: toastMock,
}));

import TaskSidebar from '../TaskSidebar';
import type {
  LongTermSubtaskItem,
  LongTermTaskItem,
  TaskItem,
} from '../timer/hooks/useTasks';

const makeTask = (
  over: Partial<TaskItem> & { id: string; title: string }
): TaskItem => ({
  status: 'todo',
  durationSeconds: 0,
  kind: 'daily',
  ...over,
});

const makeSubtask = (
  over: Partial<LongTermSubtaskItem> & { id: string; title: string }
): LongTermSubtaskItem => ({
  position: 0,
  completed_at: null,
  ...over,
});

const makeLongTermTask = (
  over: Partial<LongTermTaskItem> & { id: string; title: string }
): LongTermTaskItem => ({
  subject_id: null,
  position: 0,
  subtasks: [],
  ...over,
});

const noop = () => {};
const noopSelectSubtask = async () => null;

function renderSidebar(over: Partial<Parameters<typeof TaskSidebar>[0]> = {}) {
  return render(
    <TaskSidebar
      isOpen
      onClose={noop}
      tasks={[]}
      weeklyPlans={[]}
      monthlyPlans={[]}
      onSelectTask={noop}
      onToggleTask={noop}
      onSelectSubtask={noopSelectSubtask}
      onSelectLongTermTask={noopSelectSubtask}
      onToggleSubtask={noop}
      selectedTaskId={null}
      {...over}
    />
  );
}

describe('TaskSidebar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    toastMock.error.mockReset();
    cleanup();
  });

  it('renders all three sections with duration badges', () => {
    renderSidebar({
      tasks: [makeTask({ id: 't1', title: '오늘 작업', durationSeconds: 5400 })],
      weeklyPlans: [
        makeTask({ id: 'w1', title: '주간 작업', kind: 'weekly', durationSeconds: 600 }),
      ],
      monthlyPlans: [
        makeTask({ id: 'm1', title: '월간 작업', kind: 'monthly', durationSeconds: 60 }),
      ],
    });

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('This week')).toBeInTheDocument();
    expect(screen.getByText('This month')).toBeInTheDocument();
    expect(screen.getByText('오늘 작업')).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
    expect(screen.getByText('10m')).toBeInTheDocument();
    expect(screen.getByText('1m')).toBeInTheDocument();
  });

  it('does not render a duration badge for zero seconds', () => {
    renderSidebar({
      tasks: [makeTask({ id: 't1', title: '시간 없음', durationSeconds: 0 })],
    });

    expect(screen.getByText('시간 없음')).toBeInTheDocument();
    expect(screen.queryByText('0m')).not.toBeInTheDocument();
  });

  it('sorts done tasks below todo tasks and strikes them through', () => {
    const { container } = renderSidebar({
      tasks: [
        makeTask({ id: 't1', title: '끝난 작업', status: 'done' }),
        makeTask({ id: 't2', title: '남은 작업' }),
      ],
    });

    const text = container.textContent ?? '';
    expect(text.indexOf('남은 작업')).toBeLessThan(text.indexOf('끝난 작업'));
    expect(screen.getByText('끝난 작업').closest('button')).toHaveClass(
      'line-through'
    );
    expect(screen.getByText('남은 작업').closest('button')).not.toHaveClass(
      'line-through'
    );
  });

  it('toggles without selecting or closing', () => {
    const onSelectTask = vi.fn();
    const onToggleTask = vi.fn();
    const onClose = vi.fn();
    const task = makeTask({ id: 't1', title: '작업' });

    renderSidebar({ tasks: [task], onSelectTask, onToggleTask, onClose });

    fireEvent.click(screen.getByRole('button', { name: '완료로 표시' }));

    expect(onToggleTask).toHaveBeenCalledWith(task);
    expect(onSelectTask).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('selects a task (even a done one) and closes', () => {
    const onSelectTask = vi.fn();
    const onClose = vi.fn();
    const task = makeTask({ id: 't1', title: '끝난 작업', status: 'done' });

    renderSidebar({ tasks: [task], onSelectTask, onClose });

    fireEvent.click(screen.getByText('끝난 작업'));

    expect(onSelectTask).toHaveBeenCalledWith(task);
    expect(onClose).toHaveBeenCalled();
  });

  it('clears the selection via "Start without a task"', () => {
    const onSelectTask = vi.fn();
    const onClose = vi.fn();

    renderSidebar({ onSelectTask, onClose, selectedTaskId: 't1' });

    fireEvent.click(screen.getByText('Start without a task'));

    expect(onSelectTask).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalled();
  });

  it('offers the next task and excludes the task just completed', () => {
    const onSelectTask = vi.fn();
    const onClose = vi.fn();
    const next = makeTask({ id: 'b', title: '작업 B' });
    renderSidebar({
      tasks: [makeTask({ id: 'a', title: '작업 A', status: 'done' }), next],
      choosingNextTask: true, excludedTaskId: 'a', onSelectTask, onClose,
    });
    expect(screen.getByRole('dialog', { name: '다음 작업 선택' })).toBeInTheDocument();
    expect(screen.queryByText('작업 A')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('타이머가 잠시 멈췄어요');
    fireEvent.click(screen.getByText('작업 B'));
    expect(onSelectTask).toHaveBeenCalledWith(next);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closing the next-task picker does not choose or resume a task', () => {
    const onSelectTask = vi.fn();
    const onClose = vi.fn();
    renderSidebar({ choosingNextTask: true, onSelectTask, onClose });
    fireEvent.click(screen.getByRole('button', { name: '작업 목록 닫기' }));
    expect(onSelectTask).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disables next-task actions while completion is being prepared', () => {
    const onSelectTask = vi.fn();
    renderSidebar({
      tasks: [makeTask({ id: 'b', title: '작업 B' })],
      choosingNextTask: true, selectionDisabled: true, onSelectTask,
    });
    expect(screen.getByRole('button', { name: '작업 B' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Start without a task' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('작업 B'));
    expect(onSelectTask).not.toHaveBeenCalled();
  });

  it('shows the parent title as a subtitle for materialized Today items', () => {
    renderSidebar({
      tasks: [
        makeTask({
          id: 't1',
          title: '챕터1',
          sourceSubtaskId: 's1',
          parentTitle: '빅데이터분석기사',
        }),
        makeTask({ id: 't2', title: '일반 작업' }),
      ],
    });

    const subtitle = screen.getByText('빅데이터분석기사');
    expect(subtitle).toBeInTheDocument();
    expect(subtitle).toHaveClass('truncate');
    // 일반 작업에는 서브타이틀이 없다.
    expect(
      screen.getByText('일반 작업').closest('button')?.textContent
    ).toBe('일반 작업');
  });

  it('selects a parent without chapters, blocks duplicate clicks and waits for its daily row', async () => {
    const parent = makeLongTermTask({ id: 'coding', title: '코딩 테스트', durationSeconds: 5400 });
    let resolve!: (value: TaskItem | null) => void;
    const onSelectLongTermTask = vi.fn(() => new Promise<TaskItem | null>(done => { resolve = done; }));
    const onClose = vi.fn();
    renderSidebar({ longTermTasks: [parent], onSelectLongTermTask, onClose });
    expect(screen.getByText('누적 1h 30m')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: '코딩 테스트 공부하기' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onSelectLongTermTask).toHaveBeenCalledOnce();
    expect(onSelectLongTermTask).toHaveBeenCalledWith(parent);
    expect(button).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { resolve(makeTask({ id: 'daily-coding', title: parent.title, sourceLongTermTaskId: parent.id })); });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps direct study and expansion as separate non-nested controls', async () => {
    const parent = makeLongTermTask({ id: 'coding', title: '코딩 테스트', subtasks: [makeSubtask({ id: 's1', title: '알고리즘' })] });
    const onSelectLongTermTask = vi.fn().mockResolvedValue(makeTask({ id: 'today', title: parent.title }));
    const { container } = renderSidebar({ longTermTasks: [parent], onSelectLongTermTask });
    fireEvent.click(screen.getByText('코딩 테스트'));
    expect(screen.getByText('알고리즘')).toBeInTheDocument();
    expect(onSelectLongTermTask).not.toHaveBeenCalled();
    expect(container.querySelector('button button')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '코딩 테스트 공부하기' })); });
    expect(onSelectLongTermTask).toHaveBeenCalledOnce();
  });

  it('offers an empty parent as a next task but excludes completed parents while keeping their unfinished chapters', () => {
    renderSidebar({
      choosingNextTask: true,
      tasks: [makeTask({ id: 'done-today', title: '오늘 완료', status: 'done', sourceLongTermTaskId: 'completed' })],
      longTermTasks: [
        makeLongTermTask({ id: 'empty', title: '매일 코딩', durationSeconds: 0 }),
        makeLongTermTask({ id: 'completed', title: '완료된 부모', subtasks: [makeSubtask({ id: 'next', title: '다음 챕터' })] }),
      ],
    });
    expect(screen.getByRole('button', { name: '매일 코딩 공부하기' })).toBeEnabled();
    expect(screen.getByText('누적 0m')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '완료된 부모 공부하기' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('완료된 부모'));
    expect(screen.getByRole('button', { name: '다음 챕터' })).toBeEnabled();
  });

  it('excludes the direct parent of a handoff task even before the completed list refreshes', () => {
    renderSidebar({
      choosingNextTask: true, excludedTaskId: 'current',
      tasks: [makeTask({ id: 'current', title: '오늘 코딩', sourceLongTermTaskId: 'coding' })],
      longTermTasks: [makeLongTermTask({ id: 'coding', title: '코딩 테스트' })],
    });
    expect(screen.queryByText('코딩 테스트')).not.toBeInTheDocument();
    expect(screen.getByText(/이어서 할 작업이 없어요/)).toBeInTheDocument();
  });

  it('keeps the picker open for a failed parent selection and ignores a cancelled response', async () => {
    const parent = makeLongTermTask({ id: 'coding', title: '코딩 테스트' });
    let resolve!: (value: TaskItem | null) => void;
    const onSelectLongTermTask = vi.fn().mockResolvedValueOnce(null)
      .mockImplementationOnce(() => new Promise<TaskItem | null>(done => { resolve = done; }));
    const onClose = vi.fn();
    renderSidebar({ longTermTasks: [parent], onSelectLongTermTask, onClose });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '코딩 테스트 공부하기' })); });
    expect(toastMock.error).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '코딩 테스트 공부하기' }));
    fireEvent.click(screen.getByRole('button', { name: '작업 목록 닫기' }));
    await act(async () => { resolve(null); });
    expect(toastMock.error).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  describe('장기 과제 section', () => {
    const chapter1 = makeSubtask({ id: 's1', title: '챕터1' });
    const chapter2 = makeSubtask({
      id: 's2',
      title: '챕터2',
      position: 1,
      completed_at: '2026-08-28T09:00:00.000Z',
    });
    const chapter3 = makeSubtask({ id: 's3', title: '챕터3', position: 2 });
    const exam = makeLongTermTask({
      id: 'lt1',
      title: '빅데이터분석기사',
      subtasks: [chapter1, chapter2, chapter3],
    });

    it('does not render the section without long-term tasks', () => {
      renderSidebar();

      expect(screen.queryByText('장기 과제')).not.toBeInTheDocument();
    });

    it('renders the section with an n/m progress badge, chapters collapsed', () => {
      renderSidebar({ longTermTasks: [exam] });

      expect(screen.getByText('장기 과제')).toBeInTheDocument();
      expect(screen.getByText('빅데이터분석기사')).toBeInTheDocument();
      expect(screen.getByText('완료 1/3')).toBeInTheDocument();
      expect(screen.queryByText('챕터1')).not.toBeInTheDocument();
    });

    it('expands and collapses chapters when the task row is tapped', () => {
      renderSidebar({ longTermTasks: [exam] });

      fireEvent.click(screen.getByText('빅데이터분석기사'));
      expect(screen.getByText('챕터1')).toBeInTheDocument();
      expect(screen.getByText('챕터2')).toBeInTheDocument();

      fireEvent.click(screen.getByText('빅데이터분석기사'));
      expect(screen.queryByText('챕터1')).not.toBeInTheDocument();
    });

    it('closes only after the tapped chapter resolves to a selected task', async () => {
      let resolveSelect!: (value: TaskItem | null) => void;
      const onSelectSubtask = vi.fn(
        () =>
          new Promise<TaskItem | null>((resolve) => {
            resolveSelect = resolve;
          })
      );
      const onClose = vi.fn();

      renderSidebar({ longTermTasks: [exam], onSelectSubtask, onClose });

      fireEvent.click(screen.getByText('빅데이터분석기사'));
      fireEvent.click(screen.getByText('챕터1'));

      expect(onSelectSubtask).toHaveBeenCalledWith(chapter1);
      // 구체화가 끝나기 전에는 드로어가 열려 있고, 탭한 행은 pending 상태다.
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByText('챕터1').closest('button')).toBeDisabled();

      await act(async () => {
        resolveSelect(
          makeTask({ id: 't1', title: '챕터1', sourceSubtaskId: 's1' })
        );
      });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(toastMock.error).not.toHaveBeenCalled();
    });

    it('does not show a failure or close again when a cancelled selection settles', async () => {
      let resolveSelect!: (value: TaskItem | null) => void;
      const onSelectSubtask = vi.fn(() => new Promise<TaskItem | null>((resolve) => { resolveSelect = resolve; }));
      const onClose = vi.fn();
      renderSidebar({ longTermTasks: [exam], choosingNextTask: true, onSelectSubtask, onClose });
      fireEvent.click(screen.getByText('빅데이터분석기사'));
      fireEvent.click(screen.getByText('챕터1'));
      fireEvent.click(screen.getByRole('button', { name: '작업 목록 닫기' }));
      await act(async () => { resolveSelect(null); });
      expect(onClose).toHaveBeenCalledOnce();
      expect(toastMock.error).not.toHaveBeenCalled();
    });

    it('keeps the drawer open and surfaces an error toast when selection resolves null', async () => {
      const onSelectSubtask = vi.fn().mockResolvedValue(null);
      const onClose = vi.fn();

      renderSidebar({ longTermTasks: [exam], onSelectSubtask, onClose });

      fireEvent.click(screen.getByText('빅데이터분석기사'));
      fireEvent.click(screen.getByText('챕터1'));

      await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
      expect(onClose).not.toHaveBeenCalled();
      // pending이 풀려서 다시 시도할 수 있다.
      expect(screen.getByText('챕터1').closest('button')).not.toBeDisabled();
    });

    it('keeps the drawer open and surfaces an error toast when selection rejects', async () => {
      vi.spyOn(console, 'error').mockImplementation(noop);
      const onSelectSubtask = vi.fn().mockRejectedValue(new Error('boom'));
      const onClose = vi.fn();

      renderSidebar({ longTermTasks: [exam], onSelectSubtask, onClose });

      fireEvent.click(screen.getByText('빅데이터분석기사'));
      fireEvent.click(screen.getByText('챕터1'));

      await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
      expect(onClose).not.toHaveBeenCalled();
    });

    it('renders completed chapter titles as noninteractive text', () => {
      const onSelectSubtask = vi.fn().mockResolvedValue(null);
      const onClose = vi.fn();

      renderSidebar({ longTermTasks: [exam], onSelectSubtask, onClose });

      fireEvent.click(screen.getByText('빅데이터분석기사'));
      const title = screen.getByText('챕터2');

      // 완료된 챕터 제목은 버튼이 아니어서 포커스/탭 대상이 아니다.
      expect(title.closest('button')).toBeNull();
      fireEvent.click(title);
      expect(onSelectSubtask).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('toggles a chapter without selecting or closing', () => {
      const onSelectSubtask = vi.fn().mockResolvedValue(null);
      const onToggleSubtask = vi.fn();
      const onClose = vi.fn();

      renderSidebar({
        longTermTasks: [makeLongTermTask({ id: 'lt1', title: '자격증', subtasks: [chapter2] })],
        onSelectSubtask,
        onToggleSubtask,
        onClose,
      });

      fireEvent.click(screen.getByText('자격증'));
      fireEvent.click(screen.getByRole('button', { name: '완료 해제' }));

      expect(onToggleSubtask).toHaveBeenCalledWith(chapter2);
      expect(onSelectSubtask).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('disables a chapter toggle while that subtask write is pending', () => {
      const onToggleSubtask = vi.fn();

      renderSidebar({
        longTermTasks: [
          makeLongTermTask({
            id: 'lt1',
            title: '자격증',
            subtasks: [chapter2],
          }),
        ],
        pendingToggleSubtaskIds: new Set([chapter2.id]),
        onToggleSubtask,
      });

      fireEvent.click(screen.getByText('자격증'));
      const toggle = screen.getByRole('button', { name: '완료 해제' });

      expect(toggle).toBeDisabled();
      expect(toggle).toHaveAttribute('aria-busy', 'true');
      fireEvent.click(toggle);
      expect(onToggleSubtask).not.toHaveBeenCalled();
    });

    it('sorts completed chapters last and strikes them through', () => {
      const { container } = renderSidebar({ longTermTasks: [exam] });

      fireEvent.click(screen.getByText('빅데이터분석기사'));

      const text = container.textContent ?? '';
      expect(text.indexOf('챕터1')).toBeLessThan(text.indexOf('챕터2'));
      expect(text.indexOf('챕터3')).toBeLessThan(text.indexOf('챕터2'));
      expect(screen.getByText('챕터2').parentElement).toHaveClass(
        'line-through'
      );
      expect(screen.getByText('챕터1').parentElement).not.toHaveClass(
        'line-through'
      );
    });

    it('offers direct study without a disclosure for a task with no chapters', () => {
      const { container } = renderSidebar({
        longTermTasks: [makeLongTermTask({ id: 'lt2', title: '빈 과제' })],
      });

      expect(screen.getByText('빈 과제')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '빈 과제 공부하기' })).toBeEnabled();
      expect(screen.getByText('누적 시간 확인 불가')).toBeInTheDocument();
      expect(screen.queryByText('완료 0/0')).not.toBeInTheDocument();
      // 제목이 버튼이 아니고 aria-expanded 디스클로저도 노출하지 않는다.
      expect(screen.getByText('빈 과제').closest('button')).toBeNull();
      expect(container.querySelector('[aria-expanded]')).toBeNull();
    });

    it("marks chapters materialized today with an '오늘' chip", () => {
      renderSidebar({
        tasks: [makeTask({ id: 't1', title: '챕터1', sourceSubtaskId: 's1' })],
        longTermTasks: [exam],
      });

      fireEvent.click(screen.getByText('빅데이터분석기사'));

      expect(screen.getAllByText('오늘')).toHaveLength(1);
      const chip = screen.getByText('오늘');
      expect(chip.closest('div')).toContainElement(screen.getAllByText('챕터1')[1]);
    });
  });
});
