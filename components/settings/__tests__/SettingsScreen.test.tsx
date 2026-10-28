import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ session: null as { user: { id: string } } | null, loading: true }));
const mounts = vi.hoisted(() => ({ count: 0 }));

vi.mock('@/hooks/useAuthSession', () => ({ useAuthSession: () => auth }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithOAuth: vi.fn() } } }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
vi.mock('@/components/LoginModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog" aria-label="로그인" /> : null),
}));
vi.mock('../SettingsView', async () => {
  const { useEffect } = await import('react');
  return {
    default: function SettingsViewStub({ session, onOpenLogin }: { session: { user: { id: string } } | null; onOpenLogin: () => void }) {
      useEffect(() => { mounts.count += 1; }, []);
      return <button type="button" onClick={onOpenLogin}>{session ? session.user.id : 'guest'}</button>;
    },
  };
});

import SettingsScreen from '../SettingsScreen';
import SettingsPage, { metadata } from '@/app/settings/page';
import sitemap from '@/app/sitemap';

describe('SettingsScreen', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://testproj.supabase.co');
    window.localStorage.clear();
    auth.session = null;
    auth.loading = true;
    mounts.count = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    cleanup();
  });

  it('waits for the session before rendering the owner-specific form', () => {
    const view = render(<SettingsScreen />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    auth.loading = false;
    view.rerender(<SettingsScreen />);
    expect(screen.getByRole('button', { name: 'guest' })).toBeInTheDocument();
  });

  it('remounts the form when the signed-in account changes and opens login on request', () => {
    auth.loading = false;
    const view = render(<SettingsScreen />);
    expect(mounts.count).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'guest' }));
    expect(screen.getByRole('dialog', { name: '로그인' })).toBeInTheDocument();

    act(() => {
      window.localStorage.setItem('sb-testproj-auth-token', JSON.stringify({ access_token: 't', user: { id: 'user-a' } }));
      auth.session = { user: { id: 'user-a' } };
    });
    view.rerender(<SettingsScreen />);
    expect(screen.getByRole('button', { name: 'user-a' })).toBeInTheDocument();
    expect(mounts.count).toBe(2);
  });

  it('is a private route: titled 설정, noindex by the root default, and absent from the sitemap', () => {
    expect(metadata).toEqual({ title: '설정' });
    expect(metadata).not.toHaveProperty('robots');
    expect(sitemap().map((entry) => entry.url).some((url) => url.includes('/settings'))).toBe(false);
    auth.loading = false;
    render(<SettingsPage />);
    expect(screen.getByRole('button', { name: 'guest' })).toBeInTheDocument();
  });
});
