import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mocks.from }),
}));

const requestStatus = (status: string) => POST(new NextRequest('http://localhost/api/status', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ status, access_token: 'owner-token', user_id: 'user-1' }),
}));

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-06T06:00:00Z') });
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ update: mocks.update });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('status route activity timestamp', () => {
  it('leaves the paused study endpoint unchanged when an offline beacon arrives later', async () => {
    const response = await requestStatus('offline');

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('profiles');
    expect(mocks.update).toHaveBeenCalledWith({ status: 'offline' });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('timestamps an explicit online activity update', async () => {
    const response = await requestStatus('online');

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      status: 'online',
      last_active_at: new Date().toISOString(),
    });
  });
});
