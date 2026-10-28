import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { simulateRunningAnimations } from './motionTestUtils';

async function chooseSubject(name: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: '과목' }), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name }));
}

vi.mock('@/hooks/useStudySubjects', () => ({
  useStudySubjects: () => ({
    subjects: [
      { id: 'subject-db', user_id: 'user-1', name: '데이터베이스' },
      { id: 'subject-blockchain', user_id: 'user-1', name: '블록체인' },
    ],
    createSubject: vi.fn(async () => null),
    loading: false, error: null,
  }),
}));


const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

import WeeklyPlan from '../WeeklyPlan';

type WeeklyPlanRow = {
  id: string;
  title: string;
  subject_id?: string | null;
  status: 'todo' | 'done';
  start_date: string;
  end_date: string;
};

type SessionRow = {
  task_id: string | null;
  duration: number | null;
};

let weeklyPlans: WeeklyPlanRow[];
let sessions: SessionRow[];

// 실시간 콜백과, 다시 불러오기를 붙잡아 두는 관문(모션 테스트용. 기본은 바로 응답)
let realtimeCallbacks: Array<() => void>;
let fetchGate: Promise<void> | null;

function createChannelMock() {
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, callback: () => void) => {
      realtimeCallbacks.push(callback);
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };

  return channel;
}

function renderPlan() {
  return render(<WeeklyPlan userId="user-1" />);
}

function getCardForTitle(title: string) {
  const label = screen.getByText(title);
  const card = label.closest('.group') as HTMLElement | null;
  if (!card) {
    throw new Error(`Unable to locate card for ${title}`);
  }

  return card;
}

describe('WeeklyPlan', () => {
  beforeEach(() => {
    window.localStorage.clear();

    weeklyPlans = [
      {
        id: 'weekly-1',
        title: 'Read chapter 1',
        status: 'todo',
        start_date: '2026-03-16',
        end_date: '2026-03-22',
      },
    ];
    sessions = [{ task_id: 'weekly-1', duration: 5400 }];

    realtimeCallbacks = [];
    fetchGate = null;
    supabaseMock.channel.mockImplementation(() => createChannelMock());
    supabaseMock.removeChannel.mockReset();

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'weekly_plans') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                lte: vi.fn(() => ({
                  order: vi.fn(async () => {
                    await fetchGate;
                    return { data: weeklyPlans, error: null };
                  }),
                })),
              })),
            })),
          })),
          insert: vi.fn((payload: Omit<WeeklyPlanRow, 'id'> & { user_id: string }) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                const created = {
                  id: `weekly-${weeklyPlans.length + 1}`,
                  title: payload.title,
                  subject_id: payload.subject_id,
                  status: payload.status,
                  start_date: payload.start_date,
                  end_date: payload.end_date,
                };
                weeklyPlans = [...weeklyPlans, created];
                return { data: created, error: null };
              }),
            })),
          })),
          update: vi.fn((patch: Partial<WeeklyPlanRow>) => ({
            eq: vi.fn(async (_field: string, id: string) => {
              weeklyPlans = weeklyPlans.map((plan) =>
                plan.id === id ? { ...plan, ...patch } : plan
              );
              return { error: null };
            }),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(async (_field: string, id: string) => {
              weeklyPlans = weeklyPlans.filter((plan) => plan.id !== id);
              return { error: null };
            }),
          })),
        };
      }

      if (table === 'study_sessions') {
        return {
          select: vi.fn(() => ({
            // duration 합산은 본인 세션으로 한정된다: .eq('user_id', …).in('task_id', …)
            eq: vi.fn(() => ({
              in: vi.fn(async (_inField: string, ids: string[]) => ({
                data: sessions.filter(
                  (row) => row.task_id !== null && ids.includes(row.task_id)
                ),
                error: null,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders fetched weekly plans with duration', async () => {
    renderPlan();

    expect(await screen.findByText('Read chapter 1')).toBeInTheDocument();
    expect(screen.getByText('1시간 30분')).toBeInTheDocument();
  });

  it('infers and saves a subject from a new title while keeping subject-only edits available', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    renderPlan();
    await screen.findByText('Read chapter 1');
    fireEvent.click(screen.getByRole('button', { name: '주간 목표 추가' }));
    fireEvent.change(screen.getByPlaceholderText('주간 목표를 입력하세요'), { target: { value: '블록체인 복습' } });
    expect(screen.getByRole('combobox', { name: '과목' })).toHaveTextContent('블록체인');
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    await screen.findByText('블록체인 복습');
    expect(weeklyPlans.find((row) => row.title === '블록체인 복습')?.subject_id).toBe('subject-blockchain');
    fireEvent.click(screen.getByRole('button', { name: '블록체인 복습 수정' }));
    await chooseSubject('데이터베이스');
    fireEvent.click(screen.getByRole('button', { name: '목표 저장' }));
    await waitFor(() => expect(weeklyPlans.find((row) => row.title === '블록체인 복습')?.subject_id).toBe('subject-db'));
    expect(within(getCardForTitle('블록체인 복습')).getByText('데이터베이스')).toBeInTheDocument();
    expect(dispatch.mock.calls.filter(([event]) => event.type === 'study-subjects-changed')).toHaveLength(2);
  });

  it.each([
    ['데이터베이스', 'subject-db'],
    ['미분류', null],
  ] as const)('preserves a manual %s selection through typing and infers again for the next goal', async (name, subjectId) => {
    renderPlan();
    await screen.findByText('Read chapter 1');
    fireEvent.click(screen.getByRole('button', { name: '주간 목표 추가' }));
    const title = screen.getByPlaceholderText('주간 목표를 입력하세요');
    fireEvent.change(title, { target: { value: '블록체인 9/13 복습' } });
    await chooseSubject(name);
    fireEvent.change(title, { target: { value: '블록체인 9/15 복습' } });
    expect(screen.getByRole('combobox', { name: '과목' })).toHaveTextContent(name);
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    await screen.findByText('블록체인 9/15 복습');
    expect(weeklyPlans.find((row) => row.title === '블록체인 9/15 복습')?.subject_id).toBe(subjectId);

    fireEvent.click(screen.getByRole('button', { name: '주간 목표 추가' }));
    fireEvent.change(screen.getByPlaceholderText('주간 목표를 입력하세요'), { target: { value: '블록체인 9/17 복습' } });
    expect(screen.getByRole('combobox', { name: '과목' })).toHaveTextContent('블록체인');
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    await screen.findByText('블록체인 9/17 복습');
    expect(weeklyPlans.find((row) => row.title === '블록체인 9/17 복습')?.subject_id).toBe('subject-blockchain');
  });

  it('clears the draft and manual subject when adding is cancelled', async () => {
    renderPlan();
    await screen.findByText('Read chapter 1');
    fireEvent.click(screen.getByRole('button', { name: '주간 목표 추가' }));
    fireEvent.change(screen.getByPlaceholderText('주간 목표를 입력하세요'), { target: { value: '블록체인 초안' } });
    await chooseSubject('데이터베이스');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    fireEvent.click(screen.getByRole('button', { name: '주간 목표 추가' }));
    const title = screen.getByPlaceholderText('주간 목표를 입력하세요');
    expect(title).toHaveValue('');
    fireEvent.change(title, { target: { value: '블록체인 새 목표' } });
    expect(screen.getByRole('combobox', { name: '과목' })).toHaveTextContent('블록체인');
  });

  it('preserves the saved subject when an existing goal title is edited', async () => {
    weeklyPlans[0].subject_id = 'subject-db';
    renderPlan();
    await screen.findByText('Read chapter 1');
    fireEvent.click(screen.getByRole('button', { name: 'Read chapter 1 수정' }));
    fireEvent.change(screen.getByDisplayValue('Read chapter 1'), { target: { value: '블록체인 복습' } });
    expect(screen.getByRole('combobox', { name: '과목' })).toHaveTextContent('데이터베이스');
    fireEvent.click(screen.getByRole('button', { name: '목표 저장' }));
    await screen.findByText('블록체인 복습');
    expect(weeklyPlans[0].subject_id).toBe('subject-db');
  });

  it('adds a new weekly goal', async () => {
    renderPlan();

    expect(await screen.findByText('Read chapter 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /주간 목표 추가/i }));
    fireEvent.change(screen.getByPlaceholderText('주간 목표를 입력하세요'), {
      target: { value: 'Practice essay' },
    });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => {
      expect(screen.getByText('Practice essay')).toBeInTheDocument();
    });
  });

  it('toggles a weekly goal status', async () => {
    renderPlan();

    expect(await screen.findByText('Read chapter 1')).toBeInTheDocument();

    const card = getCardForTitle('Read chapter 1');
    const toggle = within(card).getByRole('button', { name: 'Read chapter 1 완료' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(screen.getByText('Read chapter 1')).toHaveClass('line-through');
    });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('edits a weekly goal title on Enter', async () => {
    renderPlan();

    expect(await screen.findByText('Read chapter 1')).toBeInTheDocument();

    const card = getCardForTitle('Read chapter 1');
    fireEvent.click(within(card).getByRole('button', { name: 'Read chapter 1 수정' }));

    const input = within(card).getByDisplayValue('Read chapter 1');
    fireEvent.change(input, { target: { value: 'Read chapter 2' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Read chapter 2')).toBeInTheDocument();
    });
  });

  it('deletes a weekly goal after confirmation', async () => {
    renderPlan();

    expect(await screen.findByText('Read chapter 1')).toBeInTheDocument();

    const card = getCardForTitle('Read chapter 1');
    fireEvent.click(within(card).getByRole('button', { name: 'Read chapter 1 삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(screen.queryByText('Read chapter 1')).not.toBeInTheDocument();
    });
  });
  it('keeps rows mounted during a refetch and plays each action’s motion only once', async () => {
    // 애니메이션이 도는 동안을 흉내 내 클래스가 붙어 있는 동안과 한 번 돈 뒤를 본다.
    const animations = simulateRunningAnimations();
    try {
      // 목표 탭 패널처럼 감싼 요소를 숨겼다가 다시 보일 수 있게 그린다.
      const view = (hidden: boolean) => <div hidden={hidden}><WeeklyPlan userId="user-1" /></div>;
      const { rerender } = render(view(false));
      expect(await screen.findByText('Read chapter 1')).toBeInTheDocument();
      const first = getCardForTitle('Read chapter 1');
      const animated = () => [...document.querySelectorAll('[class*="animate-"]')];
      // 처음 불러온 목록은 움직이지 않는다.
      expect(animated()).toEqual([]);

      fireEvent.click(screen.getByRole('button', { name: '주간 목표 추가' }));
      const form = screen.getByPlaceholderText('주간 목표를 입력하세요').closest('form')!;
      expect(form).toHaveClass('animate-fade-up');
      await animations.finish();
      expect(form).not.toHaveClass('animate-fade-up');
      fireEvent.change(screen.getByPlaceholderText('주간 목표를 입력하세요'), { target: { value: 'New goal' } });
      fireEvent.click(screen.getByRole('button', { name: '추가' }));
      await screen.findByText('New goal');
      const added = getCardForTitle('New goal');
      expect(animated()).toEqual([added]);
      await animations.finish();
      expect(animated()).toEqual([]);

      // 다른 탭으로 갔다가 돌아와도(패널이 숨었다 다시 보임) 방금 추가한 행이 다시 돌지 않는다.
      rerender(view(true));
      rerender(view(false));
      expect(getCardForTitle('New goal')).toBe(added);
      expect(animated()).toEqual([]);

      const toggle = within(first).getByRole('button', { name: 'Read chapter 1 완료' });
      fireEvent.click(toggle);
      expect(toggle.querySelector('svg')).toHaveClass('animate-pop-in');
      expect(screen.getByText('Read chapter 1')).toHaveClass('transition-colors');
      await waitFor(() => expect(weeklyPlans[0].status).toBe('done'));

      // 다시 불러오는 동안에도 목록을 그대로 둔다(불러오는 중 문구로 바꾸지 않는다).
      let release!: () => void;
      fetchGate = new Promise((resolve) => { release = resolve; });
      act(() => realtimeCallbacks.forEach((callback) => callback()));
      expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument();
      expect(getCardForTitle('Read chapter 1')).toBe(first);

      // 도는 중에 다른 곳에서 완료를 풀었다가 다시 완료해도 다시 튀지 않는다.
      weeklyPlans = weeklyPlans.map((plan) => plan.id === 'weekly-1' ? { ...plan, status: 'todo' } : plan);
      fetchGate = null;
      await act(async () => release());
      await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'false'));
      weeklyPlans = weeklyPlans.map((plan) => plan.id === 'weekly-1' ? { ...plan, status: 'done' } : plan);
      await act(async () => realtimeCallbacks.forEach((callback) => callback()));
      await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
      expect(animated()).toEqual([]);
      expect(getCardForTitle('Read chapter 1')).toBe(first);
      expect(getCardForTitle('New goal')).toBe(added);

      fireEvent.click(within(first).getByRole('button', { name: 'Read chapter 1 수정' }));
      const editor = within(first).getByRole('textbox', { name: '목표 제목' }).parentElement!;
      expect(editor).toHaveClass('animate-fade-up');
      await animations.finish();
      expect(editor).not.toHaveClass('animate-fade-up');
      rerender(view(true));
      rerender(view(false));
      expect(animated()).toEqual([]);
    } finally {
      animations.restore();
    }
  });
});
