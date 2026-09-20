import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import MonthlyPlan from '../MonthlyPlan';

type MonthlyPlanRow = {
  id: string;
  title: string;
  subject_id?: string | null;
  status: 'todo' | 'done';
  month: number;
  year: number;
};

type SessionRow = {
  task_id: string | null;
  duration: number | null;
};

let monthlyPlans: MonthlyPlanRow[];
let sessions: SessionRow[];

function createChannelMock() {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
  };

  return channel;
}

function renderPlan() {
  return render(<MonthlyPlan userId="user-1" />);
}

function getCardForTitle(title: string) {
  const label = screen.getByText(title);
  const card = label.closest('.group') as HTMLElement | null;
  if (!card) {
    throw new Error(`Unable to locate card for ${title}`);
  }

  return card;
}

describe('MonthlyPlan', () => {
  beforeEach(() => {
    window.localStorage.clear();

    monthlyPlans = [
      {
        id: 'monthly-1',
        title: 'Finish portfolio',
        status: 'todo',
        month: 3,
        year: 2026,
      },
    ];
    sessions = [{ task_id: 'monthly-1', duration: 7200 }];

    supabaseMock.channel.mockImplementation(() => createChannelMock());
    supabaseMock.removeChannel.mockReset();

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'monthly_plans') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(async () => ({
                    data: monthlyPlans,
                    error: null,
                  })),
                })),
              })),
            })),
          })),
          insert: vi.fn((payload: Omit<MonthlyPlanRow, 'id'> & { user_id: string }) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                const created = {
                  id: `monthly-${monthlyPlans.length + 1}`,
                  title: payload.title,
                  subject_id: payload.subject_id,
                  status: payload.status,
                  month: payload.month,
                  year: payload.year,
                };
                monthlyPlans = [...monthlyPlans, created];
                return { data: created, error: null };
              }),
            })),
          })),
          update: vi.fn((patch: Partial<MonthlyPlanRow>) => ({
            eq: vi.fn(async (_field: string, id: string) => {
              monthlyPlans = monthlyPlans.map((plan) =>
                plan.id === id ? { ...plan, ...patch } : plan
              );
              return { error: null };
            }),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(async (_field: string, id: string) => {
              monthlyPlans = monthlyPlans.filter((plan) => plan.id !== id);
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

  it('renders fetched monthly plans with duration', async () => {
    renderPlan();

    expect(await screen.findByText('Finish portfolio')).toBeInTheDocument();
    expect(screen.getByText('2h 0m')).toBeInTheDocument();
  });

  it('persists a subject on create and changes it without renaming the goal', async () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    renderPlan();
    await screen.findByText('Finish portfolio');
    fireEvent.click(screen.getByRole('button', { name: '월간 목표 추가' }));
    fireEvent.change(screen.getByPlaceholderText('월간 목표를 입력하세요'), { target: { value: '블록체인 복습' } });
    await chooseSubject('블록체인');
    fireEvent.click(screen.getByRole('button', { name: '추가' }));
    await screen.findByText('블록체인 복습');
    expect(monthlyPlans.find((row) => row.title === '블록체인 복습')?.subject_id).toBe('subject-blockchain');
    fireEvent.click(screen.getByRole('button', { name: '블록체인 복습 수정' }));
    await chooseSubject('데이터베이스');
    fireEvent.click(screen.getByRole('button', { name: '목표 저장' }));
    await waitFor(() => expect(monthlyPlans.find((row) => row.title === '블록체인 복습')?.subject_id).toBe('subject-db'));
    expect(within(getCardForTitle('블록체인 복습')).getByText('데이터베이스')).toBeInTheDocument();
    expect(dispatch.mock.calls.filter(([event]) => event.type === 'study-subjects-changed')).toHaveLength(2);
  });

  it('adds a new monthly goal', async () => {
    renderPlan();

    expect(await screen.findByText('Finish portfolio')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /월간 목표 추가/i }));
    fireEvent.change(screen.getByPlaceholderText('월간 목표를 입력하세요'), {
      target: { value: 'Ship landing page' },
    });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    await waitFor(() => {
      expect(screen.getByText('Ship landing page')).toBeInTheDocument();
    });
  });

  it('toggles a monthly goal status', async () => {
    renderPlan();

    expect(await screen.findByText('Finish portfolio')).toBeInTheDocument();

    const card = getCardForTitle('Finish portfolio');
    fireEvent.click(within(card).getAllByRole('button')[0]);

    await waitFor(() => {
      expect(screen.getByText('Finish portfolio').parentElement).toHaveClass('line-through');
    });
  });

  it('edits a monthly goal title on Enter', async () => {
    renderPlan();

    expect(await screen.findByText('Finish portfolio')).toBeInTheDocument();

    const card = getCardForTitle('Finish portfolio');
    fireEvent.click(within(card).getAllByRole('button')[1]);

    const input = within(card).getByDisplayValue('Finish portfolio');
    fireEvent.change(input, { target: { value: 'Finish redesign' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Finish redesign')).toBeInTheDocument();
    });
  });

  it('deletes a monthly goal after confirmation', async () => {
    renderPlan();

    expect(await screen.findByText('Finish portfolio')).toBeInTheDocument();

    const card = getCardForTitle('Finish portfolio');
    fireEvent.click(within(card).getAllByRole('button')[2]);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => {
      expect(screen.queryByText('Finish portfolio')).not.toBeInTheDocument();
    });
  });
});
