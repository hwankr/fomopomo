import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  const card = label.parentElement;
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
            in: vi.fn(async (_field: string, ids: string[]) => ({
              data: sessions.filter(
                (row) => row.task_id !== null && ids.includes(row.task_id)
              ),
              error: null,
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

  it('adds a new monthly goal', async () => {
    renderPlan();

    expect(await screen.findByText('Finish portfolio')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add monthly goal/i }));
    fireEvent.change(screen.getByPlaceholderText('Add a monthly goal...'), {
      target: { value: 'Ship landing page' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

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
      expect(screen.getByText('Finish portfolio')).toHaveClass('line-through');
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
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.queryByText('Finish portfolio')).not.toBeInTheDocument();
    });
  });
});
