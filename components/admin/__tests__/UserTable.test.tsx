import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UserTable from '../UserTable';
import { Profile } from '@/lib/types';

const users: Profile[] = [
  {
    id: 'user-a',
    email: 'alpha@example.com',
    nickname: 'Alpha',
    status: 'offline',
    created_at: '2026-03-01T09:00:00.000Z',
    last_active_at: '2026-03-05T10:00:00.000Z',
  },
  {
    id: 'user-b',
    email: 'bravo@example.com',
    nickname: 'Bravo',
    status: 'offline',
    created_at: '2026-03-04T09:00:00.000Z',
    last_active_at: '2026-03-05T12:00:00.000Z',
  },
  {
    id: 'user-c',
    email: 'charlie@example.com',
    nickname: 'Charlie',
    status: 'offline',
    created_at: '2026-03-06T09:00:00.000Z',
    last_active_at: null,
  },
];

function getRenderedNames() {
  const rows = screen.getAllByRole('row').slice(1);

  return rows.map((row) => {
    const firstCell = within(row).getAllByRole('cell')[0];
    return firstCell.textContent ?? '';
  });
}

describe('UserTable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sorts by recent access by default', () => {
    render(<UserTable users={users} onUserClick={vi.fn()} />);

    expect(getRenderedNames()).toEqual([
      expect.stringContaining('Bravo'),
      expect.stringContaining('Alpha'),
      expect.stringContaining('Charlie'),
    ]);
  });

  it('switches to joined date sorting', () => {
    render(<UserTable users={users} onUserClick={vi.fn()} />);

    fireEvent.change(screen.getByRole('combobox', { name: /sort/i }), {
      target: { value: 'joined' },
    });

    expect(getRenderedNames()).toEqual([
      expect.stringContaining('Charlie'),
      expect.stringContaining('Bravo'),
      expect.stringContaining('Alpha'),
    ]);
  });
});
