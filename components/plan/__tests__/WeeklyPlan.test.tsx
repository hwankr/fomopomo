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

import WeeklyPlan from '../WeeklyPlan';

type WeeklyPlanRow = {
  id: string;
  title: string;
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

function createChannelMock() {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
  };

  return channel;
}

function renderPlan() {
  return render(<WeeklyPlan userId="user-1" />);
}

function getCardForTitle(title: string) {
  const label = screen.getByText(title);
  const card = label.parentElement;
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

    supabaseMock.channel.mockImplementation(() => createChannelMock());
    supabaseMock.removeChannel.mockReset();

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'weekly_plans') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => ({
                lte: vi.fn(() => ({
                  order: vi.fn(async () => ({
                    data: weeklyPlans,
                    error: null,
                  })),
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

  it('renders fetched weekly plans with duration', async () => {
    renderPlan();

    expect(await screen.findByText('Read chapter 1')).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
  });

  it('adds a new weekly goal', async () => {
    renderPlan();

    expect(await screen.findByText('Read chapter 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add weekly goal/i }));
    fireEvent.change(screen.getByPlaceholderText('Add a weekly goal...'), {
      target: { value: 'Practice essay' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => {
      expect(screen.getByText('Practice essay')).toBeInTheDocument();
    });
  });

  it('toggles a weekly goal status', async () => {
    renderPlan();

    expect(await screen.findByText('Read chapter 1')).toBeInTheDocument();

    const card = getCardForTitle('Read chapter 1');
    fireEvent.click(within(card).getAllByRole('button')[0]);

    await waitFor(() => {
      expect(screen.getByText('Read chapter 1')).toHaveClass('line-through');
    });
  });

  it('edits a weekly goal title on Enter', async () => {
    renderPlan();

    expect(await screen.findByText('Read chapter 1')).toBeInTheDocument();

    const card = getCardForTitle('Read chapter 1');
    fireEvent.click(within(card).getAllByRole('button')[1]);

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
    fireEvent.click(within(card).getAllByRole('button')[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.queryByText('Read chapter 1')).not.toBeInTheDocument();
    });
  });
});
